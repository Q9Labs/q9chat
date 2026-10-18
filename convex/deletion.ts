import { v } from "convex/values";
import { Effect } from "effect";

import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { event } from "./lib/groups";
import { lowerCount } from "./lib/reactions";
import { deleteUser } from "./lib/workos";
export const current = internalQuery({
  args: { profileId: v.id("profiles") },
  handler: (ctx, args) => ctx.db.get(args.profileId),
});
export const step = internalAction({
  args: { profileId: v.id("profiles") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const profile = await ctx.runQuery(internal.deletion.current, args);
    if (profile?.status !== "deleting") return null;
    if (profile.signInAccountDeletedAt === undefined) {
      await Effect.runPromise(deleteUser(profile.authUserId));
      await ctx.runMutation(internal.deletion.workosDeleted, args);
    } else await ctx.runMutation(internal.deletion.batch, args);
    return null;
  },
});
export const workosDeleted = internalMutation({
  args: { profileId: v.id("profiles") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const profile = await ctx.db.get(args.profileId);
    if (profile?.status !== "deleting") return null;
    if (profile.signInAccountDeletedAt === undefined)
      await ctx.db.patch(profile._id, {
        signInAccountDeletedAt: Date.now(),
      });
    await ctx.scheduler.runAfter(0, internal.deletion.batch, args);
    return null;
  },
});
export const batch = internalMutation({
  args: { profileId: v.id("profiles") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const profile = await ctx.db.get(args.profileId);
    if (profile?.status !== "deleting" || profile.signInAccountDeletedAt === undefined) return null;
    const memberships = await ctx.db
      .query("memberships")
      .withIndex("by_profile", (q) => q.eq("profileId", profile._id))
      .take(100);
    if (memberships.length) {
      for (const row of memberships) {
        await ctx.db.delete(row._id);
        await event(ctx, row.groupId, { type: "left", profileId: profile._id });
      }
      await ctx.scheduler.runAfter(0, internal.deletion.batch, args);
      return null;
    }
    const readStates = await ctx.db
      .query("readStates")
      .withIndex("by_profile", (q) => q.eq("profileId", profile._id))
      .take(100);
    const unread = await ctx.db
      .query("unreadPosts")
      .withIndex("by_profile_group_sequence", (q) => q.eq("profileId", profile._id))
      .take(100);
    const removals = await ctx.db
      .query("removals")
      .withIndex("by_profile_dismissed", (q) => q.eq("profileId", profile._id))
      .take(100);
    const typing = await ctx.db
      .query("typing")
      .withIndex("by_profile", (q) => q.eq("profileId", profile._id))
      .take(100);
    const devices = await ctx.db
      .query("devices")
      .withIndex("by_profile", (q) => q.eq("profileId", profile._id))
      .take(100);
    const reactions = await ctx.db
      .query("reactions")
      .withIndex("by_profile", (q) => q.eq("profileId", profile._id))
      .take(100);
    const uploads = await ctx.db
      .query("uploads")
      .withIndex("by_owner", (q) => q.eq("ownerId", profile._id))
      .take(100);
    const reports = await ctx.db
      .query("reports")
      .withIndex("by_reporter", (q) => q.eq("reporterId", profile._id))
      .take(100);
    const rows = [
      ...readStates,
      ...unread,
      ...removals,
      ...typing,
      ...devices,
      ...reactions,
      ...uploads,
      ...reports,
    ].slice(0, 100);
    if (rows.length) {
      for (const row of rows) {
        if ("storageId" in row) await ctx.storage.delete(row.storageId);
        if ("emoji" in row) await lowerCount(ctx, row);
        else await ctx.db.delete(row._id);
      }
      await ctx.scheduler.runAfter(0, internal.deletion.batch, args);
      return null;
    }
    if (profile.photoStorageId) {
      await ctx.storage.delete(profile.photoStorageId);
      await ctx.db.patch(profile._id, { photoStorageId: undefined });
    }
    const remaining = profile.signInAccountDeletedAt + 3600000 - Date.now();
    if (remaining > 0) {
      await ctx.scheduler.runAfter(remaining, internal.deletion.batch, args);
      return null;
    }
    await ctx.db.replace(profile._id, { status: "deleted", deletedAt: Date.now() });
    return null;
  },
});
export const supervise = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const profiles = await ctx.db
      .query("profiles")
      .paginate({ numItems: 100, cursor: args.cursor ?? null });
    await Promise.all(
      profiles.page
        .filter((profile) => profile.status === "deleting")
        .map((profile) =>
          ctx.scheduler.runAfter(0, internal.deletion.step, { profileId: profile._id }),
        ),
    );
    if (!profiles.isDone)
      await ctx.scheduler.runAfter(0, internal.deletion.supervise, {
        cursor: profiles.continueCursor,
      });
    return null;
  },
});
