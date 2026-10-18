import { v } from "convex/values";

import { mutation } from "./_generated/server";
import { member, fail } from "./lib/access";
import { readState } from "./lib/groups";
export const markRead = mutation({
  args: { groupId: v.id("groups"), sequence: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { profile } = await member(ctx, args);
    if (
      !Number.isSafeInteger(args.sequence) ||
      args.sequence < 1 ||
      !(await ctx.db
        .query("messages")
        .withIndex("by_group_sequence", (q) =>
          q.eq("groupId", args.groupId).eq("sequence", args.sequence),
        )
        .unique())
    )
      return fail("bad_attachment");
    const state = await readState(ctx, args.groupId, profile._id);
    if (!state || state.lastReadSequence >= args.sequence) return null;
    await ctx.db.patch(state._id, { lastReadSequence: args.sequence });
    const unread = await ctx.db
      .query("unreadPosts")
      .withIndex("by_profile_group_sequence", (q) =>
        q.eq("profileId", profile._id).eq("groupId", args.groupId).lte("sequence", args.sequence),
      )
      .collect();
    for (const row of unread) await ctx.db.delete(row._id);
    return null;
  },
});
