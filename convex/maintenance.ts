import { v } from "convex/values";

import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";
export const sweepTyping = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("typing")
      .withIndex("by_expiry", (q) => q.lte("expiresAt", Date.now()))
      .paginate({ numItems: 100, cursor: args.cursor ?? null });
    await Promise.all(rows.page.map((row) => ctx.db.delete(row._id)));
    if (!rows.isDone)
      await ctx.scheduler.runAfter(0, internal.maintenance.sweepTyping, {
        cursor: rows.continueCursor,
      });
    return null;
  },
});
export const sweepUploads = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("uploads")
      .withIndex("by_creation_time", (q) => q.lt("_creationTime", Date.now() - 86400000))
      .take(100);
    for (const row of rows) {
      await ctx.storage.delete(row.storageId);
      await ctx.db.delete(row._id);
    }
    if (rows.length === 100) await ctx.scheduler.runAfter(0, internal.maintenance.sweepUploads, {});
    return null;
  },
});
