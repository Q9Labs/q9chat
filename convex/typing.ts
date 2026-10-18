import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { member } from "./lib/access";
import { membership } from "./lib/groups";
import { person } from "./lib/presentation";
export const start = mutation({
  args: { groupId: v.id("groups") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { profile } = await member(ctx, args);
    const row = await ctx.db
      .query("typing")
      .withIndex("by_group_profile", (q) =>
        q.eq("groupId", args.groupId).eq("profileId", profile._id),
      )
      .unique();
    if (row) await ctx.db.patch(row._id, { expiresAt: Date.now() + 5000 });
    else
      await ctx.db.insert("typing", {
        groupId: args.groupId,
        profileId: profile._id,
        expiresAt: Date.now() + 5000,
      });
    return null;
  },
});
export const stop = mutation({
  args: { groupId: v.id("groups") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { profile } = await member(ctx, args);
    const row = await ctx.db
      .query("typing")
      .withIndex("by_group_profile", (q) =>
        q.eq("groupId", args.groupId).eq("profileId", profile._id),
      )
      .unique();
    if (row) await ctx.db.delete(row._id);
    return null;
  },
});
export const list = query({
  args: { groupId: v.id("groups") },
  returns: v.array(v.object({ id: v.id("profiles"), name: v.string(), expiresAt: v.number() })),
  handler: async (ctx, args) => {
    const { profile } = await member(ctx, args);
    const rows = await ctx.db
      .query("typing")
      .withIndex("by_group_profile", (q) => q.eq("groupId", args.groupId))
      .collect();
    const result = [];
    for (const row of rows) {
      if (
        row.profileId === profile._id ||
        row.expiresAt <= Date.now() ||
        !(await membership(ctx, args.groupId, row.profileId))
      )
        continue;
      const resolved = await person(ctx, row.profileId, profile._id);
      if (!resolved.deleted)
        result.push({ id: row.profileId, name: resolved.name, expiresAt: row.expiresAt });
    }
    return result;
  },
});
