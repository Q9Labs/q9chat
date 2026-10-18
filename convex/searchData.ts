import { messageSummary } from "@q9chat/domain";
import { v } from "convex/values";

import { internalQuery } from "./_generated/server";
import { active } from "./lib/access";
import { membership } from "./lib/groups";
import { groupDisplay, person } from "./lib/presentation";
import { searchHit } from "./lib/validators";
export const groups = internalQuery({
  args: { profileId: v.id("profiles"), groupId: v.optional(v.id("groups")) },
  returns: v.array(v.id("groups")),
  handler: async (ctx, args) => {
    const profile = await active(ctx);
    if (profile._id !== args.profileId) return [];
    const rows = await ctx.db
      .query("memberships")
      .withIndex("by_profile", (q) => q.eq("profileId", profile._id))
      .collect();
    return rows
      .filter((row) => !args.groupId || row.groupId === args.groupId)
      .map((row) => row.groupId);
  },
});
export const batch = internalQuery({
  args: { profileId: v.id("profiles"), groupIds: v.array(v.id("groups")), query: v.string() },
  returns: v.array(searchHit),
  handler: async (ctx, args) => {
    const profile = await active(ctx);
    if (profile._id !== args.profileId || args.groupIds.length > 10) return [];
    const hits = await Promise.all(
      args.groupIds.map(async (groupId) => {
        if (!(await membership(ctx, groupId, profile._id))) return [];
        const group = await ctx.db.get(groupId);
        if (!group) return [];
        const display = await groupDisplay(ctx, group, profile._id);
        const messages = await ctx.db
          .query("messages")
          .withSearchIndex("search_text", (q) =>
            q.search("searchText", args.query).eq("groupId", groupId),
          )
          .take(10);
        return Promise.all(
          messages
            .filter((message) => message.kind === "post")
            .map(async (message) => ({
              groupId,
              groupTitle: display.title,
              sequence: message.sequence,
              author: await person(ctx, message.authorId, profile._id),
              createdAt: message._creationTime,
              snippet: messageSummary(message),
            })),
        );
      }),
    );
    return hits.flat();
  },
});
