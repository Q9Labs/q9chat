import { messageSummary, parseMentions } from "@q9chat/domain";
import { v, type Infer } from "convex/values";

import { internal } from "./_generated/api";
import { action, mutation, query } from "./_generated/server";
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
    if (!args.clientKey || args.clientKey.length > 64) throw new Error("Invalid client key");
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
      reactionCounts: [],
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
    const resolve = p.personCache(ctx, profile._id);
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
            event: await p.resolvedEvent(ctx, message.event, profile._id, resolve),
          };
        const author = await resolve(message.authorId);
        if (message.kind === "deleted") return { ...base, kind: "deleted" as const, author };
        const quote = message.replyToId ? await ctx.db.get(message.replyToId) : null;
        const replyTo =
          !quote || quote.kind === "event"
            ? null
            : quote.kind === "deleted"
              ? {
                  id: quote._id,
                  sequence: quote.sequence,
                  author: await resolve(quote.authorId),
                  deleted: true as const,
                }
              : {
                  id: quote._id,
                  sequence: quote.sequence,
                  author: await resolve(quote.authorId),
                  summary: messageSummary(quote),
                };
        const mine = await ctx.db
          .query("reactions")
          .withIndex("by_message_profile", (q) =>
            q.eq("messageId", message._id).eq("profileId", profile._id),
          )
          .unique();
        const reactions = message.reactionCounts.map((item) => ({
          ...item,
          mine: mine?.emoji === item.emoji,
        }));
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
          mentions: message.mentions,
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
    await ctx.scheduler.runAfter(0, internal.cleanup.reactions, { messageId: message._id });
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
    const counts = message.reactionCounts.map((item) => ({ ...item }));
    if (row?.emoji === args.emoji) return null;
    if (row) {
      const count = counts.find((item) => item.emoji === row.emoji);
      if (count) count.count -= 1;
    }
    if (args.emoji) {
      const count = counts.find((item) => item.emoji === args.emoji);
      if (count) count.count += 1;
      else counts.push({ emoji: args.emoji, count: 1 });
    }
    if (args.emoji === null) {
      if (row) await ctx.db.delete(row._id);
    } else if (row) await ctx.db.patch(row._id, { emoji: args.emoji });
    else
      await ctx.db.insert("reactions", {
        messageId: args.messageId,
        profileId: profile._id,
        emoji: args.emoji,
      });
    await ctx.db.patch(message._id, { reactionCounts: counts.filter((item) => item.count > 0) });

    return null;
  },
});
export const reactors = query({
  args: { messageId: v.id("messages") },
  returns: v.array(
    v.object({
      emoji: reactionEmojiValidator,
      count: v.number(),
      people: v.array(validators.person),
    }),
  ),
  handler: async (ctx, args) => {
    const { profile, message } = await member(ctx, args);
    if (message?.kind !== "post") return [];
    return Promise.all(
      message.reactionCounts.map(async (item) => {
        const rows = await ctx.db
          .query("reactions")
          .withIndex("by_message_emoji", (q) =>
            q.eq("messageId", message._id).eq("emoji", item.emoji),
          )
          .take(10);
        return {
          ...item,
          people: await Promise.all(rows.map((row) => p.person(ctx, row.profileId, profile._id))),
        };
      }),
    );
  },
});
export const search = action({
  args: { query: v.string(), groupId: v.optional(v.id("groups")) },
  returns: v.array(validators.searchHit),
  handler: async (ctx, args): Promise<Infer<typeof validators.searchHit>[]> => {
    const profile = await active(ctx);
    if (args.query.length > 100) throw new Error("Query exceeds 100 characters");
    if (!args.query.trim()) return [];
    const groupIds = await ctx.runQuery(internal.searchData.groups, {
      profileId: profile._id,
      ...(args.groupId ? { groupId: args.groupId } : {}),
    });
    const batches = [];
    for (let offset = 0; offset < groupIds.length; offset += 10)
      batches.push(groupIds.slice(offset, offset + 10));
    const results = await Promise.all(
      batches.map((batchIds) =>
        ctx.runQuery(internal.searchData.batch, {
          profileId: profile._id,
          groupIds: batchIds,
          query: args.query,
        }),
      ),
    );
    return results
      .flat()
      .toSorted((a, b) => b.createdAt - a.createdAt)
      .slice(0, 50);
  },
});
