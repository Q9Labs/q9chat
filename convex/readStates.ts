import { v } from "convex/values";

import { internal } from "./_generated/api";
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
    await ctx.scheduler.runAfter(0, internal.cleanup.unread, {
      profileId: profile._id,
      groupId: args.groupId,
      cutoff: args.sequence,
    });
    return null;
  },
});
