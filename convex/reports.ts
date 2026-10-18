import { v } from "convex/values";

import { mutation } from "./_generated/server";
import { member, fail } from "./lib/access";
import { reportReasonValidator } from "./schema";
export const create = mutation({
  args: { messageId: v.id("messages"), reason: reportReasonValidator },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { profile, message } = await member(ctx, args);
    if (!message || message.kind !== "post" || message.authorId === profile._id)
      return fail("not_author");
    const row = await ctx.db
      .query("reports")
      .withIndex("by_message_reporter", (q) =>
        q.eq("messageId", args.messageId).eq("reporterId", profile._id),
      )
      .unique();
    if (!row)
      await ctx.db.insert("reports", {
        messageId: args.messageId,
        reporterId: profile._id,
        reason: args.reason,
        excerpt: message.body,
      });
    return null;
  },
});
