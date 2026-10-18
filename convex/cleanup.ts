import { v } from "convex/values";

import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";
export const unread = internalMutation({
  args: { profileId: v.id("profiles"), groupId: v.id("groups"), cutoff: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("unreadPosts")
      .withIndex("by_profile_group_sequence", (q) =>
        q.eq("profileId", args.profileId).eq("groupId", args.groupId).lte("sequence", args.cutoff),
      )
      .take(100);
    await Promise.all(rows.map((row) => ctx.db.delete(row._id)));
    if (rows.length === 100) await ctx.scheduler.runAfter(0, internal.cleanup.unread, args);
    return null;
  },
});
export const reactions = internalMutation({
  args: { messageId: v.id("messages") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("reactions")
      .withIndex("by_message_profile", (q) => q.eq("messageId", args.messageId))
      .take(100);
    await Promise.all(rows.map((row) => ctx.db.delete(row._id)));
    if (rows.length === 100) await ctx.scheduler.runAfter(0, internal.cleanup.reactions, args);
    return null;
  },
});
