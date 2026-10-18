import { messageSummary, parseMentions, reactionEmoji } from "@q9chat/domain";
import { v } from "convex/values";

import { internal } from "./_generated/api";
import { mutation, query } from "./_generated/server";
import { active, member, fail } from "./lib/access";
import * as g from "./lib/groups";
import * as p from "./lib/presentation";
import { attachments as consumeAttachments } from "./lib/uploads";
import * as validators from "./lib/validators";
import { reactionEmojiValidator } from "./schema";
export const send = mutation({
  args: {
    groupId: v.id("groups"),
    clientKey: v.string(),
    body: v.string(),
    replyToId: v.optional(v.id("messages")),
    attachments: v.array(validators.uploadAttachment),
  },
  returns: v.object({ messageId: v.id("messages"), sequence: v.number() }),
  handler: async (ctx, args) => {
    const { profile } = await member(ctx, args);
    const previous = await ctx.db
      .query("messages")
      .withIndex("by_author_client_key", (q) =>
        q.eq("authorId", profile._id).eq("clientKey", args.clientKey),
      )
      .unique();
    if (previous) {
      if (previous.groupId !== args.groupId) return fail("client_key_reused");
      return { messageId: previous._id, sequence: previous.sequence };
    }
    if (args.body.length > 4000) return fail("message_too_long");
    const attachments = await consumeAttachments(ctx, profile._id, args.body, args.attachments);
    const reply = args.replyToId ? await ctx.db.get(args.replyToId) : null;
    if (args.replyToId && (!reply || reply.kind === "event" || reply.groupId !== args.groupId))
      return fail("bad_attachment");
    const people = await g.memberships(ctx, args.groupId);
    const resolved = await Promise.all(
      people.map((row) => p.person(ctx, row.profileId, profile._id)),
    );
    const mentioned = new Set(parseMentions(args.body, resolved));
    const mentions = resolved
      .filter((person) => mentioned.has(person.id) && !person.deleted)
      .map((person) => person.id);
    const group = await ctx.db.get(args.groupId);
    if (!group) return fail("not_member");
    const sequence = group.lastSequence + 1;
    await ctx.db.patch(group._id, { lastSequence: sequence });
    const messageId = await ctx.db.insert("messages", {
      kind: "post",
      groupId: group._id,
      sequence,
      authorId: profile._id,
      clientKey: args.clientKey,
      body: args.body,
      searchText: attachments.some((file) => file.kind === "voice")
        ? ""
        : [
            args.body,
            ...attachments.flatMap((file) => (file.kind === "file" ? [file.name] : [])),
          ].join(" "),
      ...(args.replyToId ? { replyToId: args.replyToId } : {}),
      mentions,
      attachments,
    });
    for (const row of people) {
      if (row.profileId === profile._id) continue;
      await ctx.db.insert("unreadPosts", {
        profileId: row.profileId,
        groupId: group._id,
        sequence,
      });
      if (
        mentions.includes(row.profileId) ||
        (reply && reply.kind !== "event" && reply.authorId === row.profileId)
      ) {
        const state = await g.readState(ctx, group._id, row.profileId);
        if (state) await ctx.db.patch(state._id, { lastNeedsYouSequence: sequence });
      }
    }
    await ctx.scheduler.runAfter(0, internal.notifications.deliver, {
      messageId,
      recipientIds: people
        .filter((row) => row.profileId !== profile._id)
        .map((row) => row.profileId),
      needsYouIds: people
        .filter(
          (row) =>
            mentions.includes(row.profileId) ||
            (reply && reply.kind !== "event" && reply.authorId === row.profileId),
        )
        .map((row) => row.profileId),
    });
    return { messageId, sequence };
  },
});
export const range = query({
  args: { groupId: v.id("groups"), fromSequence: v.number(), toSequence: v.number() },
  returns: v.array(validators.message),
  handler: async (ctx, args) => {
    const { profile } = await member(ctx, args);
    if (
      !Number.isSafeInteger(args.fromSequence) ||
      !Number.isSafeInteger(args.toSequence) ||
      args.fromSequence < 1 ||
      args.toSequence < args.fromSequence ||
      args.toSequence - args.fromSequence >= 100
    )
      return fail("bad_attachment");
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_group_sequence", (q) =>
        q
          .eq("groupId", args.groupId)
          .gte("sequence", args.fromSequence)
          .lte("sequence", args.toSequence),
      )
      .collect();
    return Promise.all(
      messages.map(async (message) => {
        const base = {
          id: message._id,
          sequence: message.sequence,
          createdAt: message._creationTime,
        };
        if (message.kind === "event")
          return {
            ...base,
            kind: "event" as const,
            event: await p.resolvedEvent(ctx, message.event, profile._id),
          };
        const author = await p.person(ctx, message.authorId, profile._id);
        if (message.kind === "deleted") return { ...base, kind: "deleted" as const, author };
        const quote = message.replyToId ? await ctx.db.get(message.replyToId) : null;
        const replyTo =
          !quote || quote.kind === "event"
            ? null
            : quote.kind === "deleted"
              ? { id: quote._id, sequence: quote.sequence, deleted: true as const }
              : {
                  id: quote._id,
                  sequence: quote.sequence,
                  author: await p.person(ctx, quote.authorId, profile._id),
                  summary: messageSummary(quote),
                };
        const rows = await ctx.db
          .query("reactions")
          .withIndex("by_message_profile", (q) => q.eq("messageId", message._id))
          .collect();
        const reactions = await Promise.all(
          reactionEmoji
            .filter((emoji) => rows.some((row) => row.emoji === emoji))
            .map(async (emoji) => {
              const matching = rows.filter((row) => row.emoji === emoji);
              return {
                emoji,
                count: matching.length,
                mine: matching.some((row) => row.profileId === profile._id),
                people: await Promise.all(
                  matching.slice(0, 10).map((row) => p.person(ctx, row.profileId, profile._id)),
                ),
              };
            }),
        );
        const attachments = message.attachments.map((file, index) => {
          const { storageId: _storageId, ...metadata } = file;
          return { ...metadata, url: `/files/${message._id}/${index}` };
        });
        return {
          ...base,
          kind: "post" as const,
          clientKey: message.clientKey,
          author,
          body: message.body,
          mentions: await Promise.all(message.mentions.map((id) => p.person(ctx, id, profile._id))),
          attachments,
          replyTo,
          reactions,
          editedAt: message.editedAt ?? null,
        };
      }),
    );
  },
});
export const edit = mutation({
  args: { messageId: v.id("messages"), body: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { profile, message, groupId } = await member(ctx, args);
    if (!message || message.kind === "event" || message.authorId !== profile._id)
      return fail("not_author");
    if (message.kind !== "post" || message.attachments.length || !args.body.trim())
      return fail("bad_attachment");
    if (args.body.length > 4000) return fail("message_too_long");
    const members = await g.memberships(ctx, groupId);
    const people = await Promise.all(
      members.map((row) => p.person(ctx, row.profileId, profile._id)),
    );
    const ids = new Set(parseMentions(args.body, people));
    await ctx.db.patch(message._id, {
      body: args.body,
      searchText: args.body,
      mentions: people
        .filter((person) => ids.has(person.id) && !person.deleted)
        .map((person) => person.id),
      editedAt: Date.now(),
    });
    return null;
  },
});
export const remove = mutation({
  args: { messageId: v.id("messages") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { profile, message } = await member(ctx, args);
    if (!message || message.kind === "event" || message.authorId !== profile._id)
      return fail("not_author");
    if (message.kind === "deleted") return null;
    for (const file of message.attachments) await ctx.storage.delete(file.storageId);
    const reactions = await ctx.db
      .query("reactions")
      .withIndex("by_message_profile", (q) => q.eq("messageId", message._id))
      .collect();
    for (const row of reactions) await ctx.db.delete(row._id);
    await ctx.db.replace(message._id, {
      kind: "deleted",
      groupId: message.groupId,
      sequence: message.sequence,
      authorId: message.authorId,
      clientKey: message.clientKey,
      deletedAt: Date.now(),
    });
    return null;
  },
});
export const react = mutation({
  args: { messageId: v.id("messages"), emoji: v.union(reactionEmojiValidator, v.null()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { profile, message } = await member(ctx, args);
    if (message?.kind !== "post") return fail("bad_attachment");
    const row = await ctx.db
      .query("reactions")
      .withIndex("by_message_profile", (q) =>
        q.eq("messageId", args.messageId).eq("profileId", profile._id),
      )
      .unique();
    if (args.emoji === null) {
      if (row) await ctx.db.delete(row._id);
    } else if (row) await ctx.db.patch(row._id, { emoji: args.emoji });
    else
      await ctx.db.insert("reactions", {
        messageId: args.messageId,
        profileId: profile._id,
        emoji: args.emoji,
      });
    return null;
  },
});
export const search = query({
  args: { query: v.string(), groupId: v.optional(v.id("groups")) },
  returns: v.array(
    v.object({
      groupId: v.id("groups"),
      groupTitle: v.string(),
      sequence: v.number(),
      author: validators.person,
      createdAt: v.number(),
      snippet: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    const profile = await active(ctx);
    if (!args.query.trim()) return [];
    const memberships = await ctx.db
      .query("memberships")
      .withIndex("by_profile", (q) => q.eq("profileId", profile._id))
      .collect();
    const hits = [];
    for (const row of memberships) {
      if (args.groupId && args.groupId !== row.groupId) continue;
      const group = await ctx.db.get(row.groupId);
      if (!group) continue;
      const display = await p.groupDisplay(ctx, group, profile._id);
      const results = await ctx.db
        .query("messages")
        .withSearchIndex("search_text", (q) =>
          q.search("searchText", args.query).eq("groupId", group._id),
        )
        .take(20);
      for (const message of results)
        if (message.kind === "post")
          hits.push({
            groupId: group._id,
            groupTitle: display.title,
            sequence: message.sequence,
            author: await p.person(ctx, message.authorId, profile._id),
            createdAt: message._creationTime,
            snippet: messageSummary(message),
          });
    }
    return hits.toSorted((a, b) => b.createdAt - a.createdAt).slice(0, 50);
  },
});
