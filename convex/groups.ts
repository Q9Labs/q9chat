import { firstName } from "@q9chat/domain";
import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { active, member, fail } from "./lib/access";
import * as g from "./lib/groups";
import * as p from "./lib/presentation";
import * as validators from "./lib/validators";
import { notifyModeValidator } from "./schema";
export const list = query({
  args: {},
  returns: v.array(validators.groupRow),
  handler: async (ctx) => {
    const profile = await active(ctx);
    const own = await ctx.db
      .query("memberships")
      .withIndex("by_profile", (q) => q.eq("profileId", profile._id))
      .collect();
    const rows = [];
    for (const row of own) {
      const group = await ctx.db.get(row.groupId);
      if (!group) continue;
      const display = await p.groupDisplay(ctx, group, profile._id);
      const latest = await ctx.db
        .query("messages")
        .withIndex("by_group_sequence", (q) => q.eq("groupId", group._id))
        .order("desc")
        .first();
      const state = await g.readState(ctx, group._id, profile._id);
      const unread = await ctx.db
        .query("unreadPosts")
        .withIndex("by_profile_group_sequence", (q) =>
          q
            .eq("profileId", profile._id)
            .eq("groupId", group._id)
            .gt("sequence", state?.lastReadSequence ?? 0),
        )
        .take(100);
      rows.push({
        status: "member" as const,
        groupId: group._id,
        kind: group.kind,
        title: display.title,
        avatar: display.avatar,
        lastActivityAt: latest?._creationTime ?? group._creationTime,
        preview: await p.preview(ctx, latest, profile._id),
        unreadCount: unread.length,
        needsYou: (state?.lastNeedsYouSequence ?? 0) > (state?.lastReadSequence ?? 0),
        notify: row.notify,
      });
    }
    const removals = await ctx.db
      .query("removals")
      .withIndex("by_profile_dismissed", (q) =>
        // Convex indexes absent optional fields as undefined, not null.
        // eslint-disable-next-line unicorn/no-useless-undefined
        q.eq("profileId", profile._id).eq("dismissedAt", undefined),
      )
      .collect();
    const removedRows = [];
    for (const row of removals) {
      if (row.dismissedAt !== undefined) continue;
      const group = await ctx.db.get(row.groupId);
      if (!group) continue;
      const display = await p.groupDisplay(ctx, group, profile._id);
      removedRows.push({
        status: "removed" as const,
        groupId: group._id,
        kind: group.kind,
        title: display.title,
        avatar: display.avatar,
        removedBy: await p.person(ctx, row.removedBy, profile._id),
        removedAt: row.removedAt,
      });
    }
    return [...rows, ...removedRows].toSorted(
      (a, b) =>
        (b.status === "member" ? b.lastActivityAt : b.removedAt) -
        (a.status === "member" ? a.lastActivityAt : a.removedAt),
    );
  },
});
export const get = query({
  args: { groupId: v.id("groups") },
  returns: v.union(
    v.null(),
    v.object({ status: v.literal("removed"), ...validators.removed }),
    v.object({
      status: v.literal("member"),
      groupId: v.id("groups"),
      kind: validators.groupKind,
      title: v.string(),
      avatar: validators.avatar,
      memberCount: v.number(),
      members: v.array(validators.person),
      partner: v.union(validators.person, v.null()),
      notify: notifyModeValidator,
      inviteToken: v.union(v.string(), v.null()),
      lastSequence: v.number(),
      lastReadSequence: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const access = await member(ctx, { ...args, removalNotice: true });
    if (!access.membership) {
      const removed = await g.removal(ctx, args.groupId, access.profile._id);
      if (!removed || removed.dismissedAt !== undefined) return null;
      const group = await ctx.db.get(args.groupId);
      if (!group) return null;
      const display = await p.groupDisplay(ctx, group, access.profile._id);
      return {
        status: "removed" as const,
        title: display.title,
        avatar: display.avatar,
        removedBy: await p.person(ctx, removed.removedBy, access.profile._id),
        removedAt: removed.removedAt,
      };
    }
    const group = await ctx.db.get(args.groupId);
    if (!group) return null;
    const people = await g.memberships(ctx, group._id);
    const state = await g.readState(ctx, group._id, access.profile._id);
    return {
      status: "member" as const,
      groupId: group._id,
      kind: group.kind,
      ...(await p.groupDisplay(ctx, group, access.profile._id)),
      memberCount: people.length,
      members: await Promise.all(
        people.map((row) => p.person(ctx, row.profileId, access.profile._id)),
      ),
      notify: access.membership.notify,
      inviteToken: group.kind === "group" ? group.inviteToken : null,
      lastSequence: group.lastSequence,
      lastReadSequence: state?.lastReadSequence ?? 0,
    };
  },
});
export const create = mutation({
  args: {
    name: v.optional(v.string()),
    memberIds: v.array(v.id("profiles")),
    inviteToken: v.string(),
  },
  returns: v.id("groups"),
  handler: async (ctx, args) => {
    const profile = await active(ctx);
    const ids = [...new Set(args.memberIds)].filter((id) => id !== profile._id);
    if (ids.length > 99) return fail("group_full");
    if (
      !/^[A-Za-z0-9]{16,32}$/u.test(args.inviteToken) ||
      (await ctx.db
        .query("groups")
        .withIndex("by_invite_token", (q) => q.eq("inviteToken", args.inviteToken))
        .unique())
    )
      throw new Error("Invalid or reused invite token");
    const people = await Promise.all(ids.map((id) => g.targetActive(ctx, id)));
    const name = args.name?.trim()
      ? args.name.trim()
      : people.map((person) => firstName(person.displayName)).join(", ");
    if (!name) return fail("name_required");
    if (name.length > 80) return fail("name_too_long");
    const groupId = await ctx.db.insert("groups", {
      kind: "group",
      name,
      inviteToken: args.inviteToken,
      createdBy: profile._id,
      lastSequence: 0,
    });
    await g.event(ctx, groupId, { type: "created", by: profile._id });
    if (ids.length)
      await g.event(ctx, groupId, { type: "added", by: profile._id, profileIds: ids });
    await g.add(ctx, groupId, [profile._id, ...ids], ids.length ? 2 : 1);
    return groupId;
  },
});
export const pairWith = query({
  args: { profileId: v.id("profiles") },
  returns: v.union(v.id("groups"), v.null()),
  handler: async (ctx, args) => {
    const profile = await active(ctx);
    await g.targetActive(ctx, args.profileId);
    if (profile._id === args.profileId) return fail("pair_locked");
    return (
      (
        await ctx.db
          .query("groups")
          .withIndex("by_pair_key", (q) => q.eq("pairKey", g.pairKey(profile._id, args.profileId)))
          .unique()
      )?._id ?? null
    );
  },
});
export const openPair = mutation({
  args: { profileId: v.id("profiles") },
  returns: v.id("groups"),
  handler: async (ctx, args) => {
    const profile = await active(ctx);
    await g.targetActive(ctx, args.profileId);
    if (profile._id === args.profileId) return fail("pair_locked");
    const pairKey = g.pairKey(profile._id, args.profileId);
    const existing = await ctx.db
      .query("groups")
      .withIndex("by_pair_key", (q) => q.eq("pairKey", pairKey))
      .unique();
    if (existing) return existing._id;
    const groupId = await ctx.db.insert("groups", { kind: "pair", pairKey, lastSequence: 0 });
    await g.add(ctx, groupId, [profile._id, args.profileId], 0);
    return groupId;
  },
});
export const addMembers = mutation({
  args: { groupId: v.id("groups"), profileIds: v.array(v.id("profiles")) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { profile } = await member(ctx, args);
    const group = await ctx.db.get(args.groupId);
    if (group?.kind !== "group") return fail("pair_locked");
    if (args.profileIds.length > 50) throw new Error("Add at most 50 people");
    const added = await g.add(ctx, group._id, args.profileIds, group.lastSequence + 1);
    if (added.length)
      await g.event(ctx, group._id, { type: "added", by: profile._id, profileIds: added });
    return null;
  },
});
export const removeMember = mutation({
  args: { groupId: v.id("groups"), profileId: v.id("profiles") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { profile } = await member(ctx, args);
    const group = await ctx.db.get(args.groupId);
    if (group?.kind !== "group" || args.profileId === profile._id) return fail("pair_locked");
    if (!(await g.membership(ctx, group._id, args.profileId))) return null;
    await g.clearMembership(ctx, group._id, args.profileId);
    await ctx.db.insert("removals", {
      groupId: group._id,
      profileId: args.profileId,
      removedBy: profile._id,
      removedAt: Date.now(),
    });
    const notices = await ctx.db
      .query("removals")
      .withIndex("by_profile_dismissed", (q) =>
        // Convex indexes absent optional fields as undefined, not null.
        // eslint-disable-next-line unicorn/no-useless-undefined
        q.eq("profileId", args.profileId).eq("dismissedAt", undefined),
      )
      .collect();
    for (const oldest of notices
      .toSorted((a, b) => a.removedAt - b.removedAt)
      .slice(0, Math.max(0, notices.length - 20)))
      await ctx.db.patch(oldest._id, { dismissedAt: Date.now() });
    await g.event(ctx, group._id, { type: "removed", by: profile._id, profileId: args.profileId });
    return null;
  },
});
export const leave = mutation({
  args: { groupId: v.id("groups") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const profile = await active(ctx);
    if (!(await g.membership(ctx, args.groupId, profile._id))) return null;
    const group = await ctx.db.get(args.groupId);
    if (group?.kind !== "group") return fail("pair_locked");
    await g.clearMembership(ctx, args.groupId, profile._id);
    await g.event(ctx, args.groupId, { type: "left", profileId: profile._id });
    return null;
  },
});
export const dismissRemoval = mutation({
  args: { groupId: v.id("groups") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const profile = await active(ctx);
    const row = await g.removal(ctx, args.groupId, profile._id);
    if (row && row.dismissedAt === undefined)
      await ctx.db.patch(row._id, { dismissedAt: Date.now() });
    return null;
  },
});
export const setNotify = mutation({
  args: { groupId: v.id("groups"), notify: notifyModeValidator },
  returns: notifyModeValidator,
  handler: async (ctx, args) => {
    const access = await member(ctx, args);
    if (!access.membership) return fail("not_member");
    await ctx.db.patch(access.membership._id, { notify: args.notify });
    return args.notify;
  },
});
export const inviteInfo = query({
  args: { token: v.string() },
  returns: v.union(
    v.null(),
    v.object({ status: v.literal("removed") }),
    v.object({ status: v.literal("member"), groupId: v.id("groups") }),
    v.object({
      status: v.literal("open"),
      groupId: v.id("groups"),
      title: v.string(),
      memberCount: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const profile = await active(ctx);
    g.validateInviteToken(args.token);
    const group = await ctx.db
      .query("groups")
      .withIndex("by_invite_token", (q) => q.eq("inviteToken", args.token))
      .unique();
    if (!group || group.kind !== "group") return null;
    if (await g.membership(ctx, group._id, profile._id))
      return { status: "member" as const, groupId: group._id };
    if (await g.removal(ctx, group._id, profile._id)) return { status: "removed" as const };
    return {
      status: "open" as const,
      groupId: group._id,
      title: group.name,
      memberCount: (await g.memberships(ctx, group._id)).length,
    };
  },
});
export const join = mutation({
  args: { token: v.string() },
  returns: v.id("groups"),
  handler: async (ctx, args) => {
    const profile = await active(ctx);
    g.validateInviteToken(args.token);
    const group = await ctx.db
      .query("groups")
      .withIndex("by_invite_token", (q) => q.eq("inviteToken", args.token))
      .unique();
    if (!group || group.kind !== "group") return fail("invite_invalid");
    if (await g.membership(ctx, group._id, profile._id)) return group._id;
    if (await g.removal(ctx, group._id, profile._id)) return fail("removed_from_group");
    await g.add(ctx, group._id, [profile._id], group.lastSequence + 1);
    await g.event(ctx, group._id, { type: "joined", profileId: profile._id });
    return group._id;
  },
});
