import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { query } from "./_generated/server";
import { active } from "./lib/access";
import { memberships } from "./lib/groups";
import { person } from "./lib/presentation";
import { avatar } from "./lib/validators";
async function nameCandidates(
  ctx: QueryCtx,
  profileId: Id<"profiles">,
  term: string,
  ids: Set<Id<"profiles">>,
) {
  const own = await ctx.db
    .query("memberships")
    .withIndex("by_profile", (q) => q.eq("profileId", profileId))
    .collect();
  for (const row of own) {
    if (ids.size >= 4) break;
    for (const candidate of await memberships(ctx, row.groupId)) {
      if (
        candidate.profileId !== profileId &&
        candidate.searchName.split(/\s+/u).some((word) => word.startsWith(term))
      )
        ids.add(candidate.profileId);
      if (ids.size >= 4) break;
    }
  }
}
export const find = query({
  args: { query: v.string() },
  returns: v.array(
    v.object({
      id: v.id("profiles"),
      name: v.string(),
      fullName: v.string(),
      email: v.string(),
      avatar,
    }),
  ),
  handler: async (ctx, args) => {
    const profile = await active(ctx);
    if (args.query.length > 100) throw new Error("Query exceeds 100 characters");
    const term = args.query.trim().toLowerCase();
    if (!term) return [];
    const exact = await ctx.db
      .query("profiles")
      .withIndex("by_email", (q) => q.eq("email", term))
      .take(4);
    const ids = new Set(
      exact
        .filter((value) => value.status === "active" && value._id !== profile._id)
        .map((value) => value._id),
    );
    await nameCandidates(ctx, profile._id, term, ids);
    const result = [];
    for (const id of ids) {
      const target = exact.find((value) => value._id === id) ?? (await ctx.db.get(id));
      if (target?.status !== "active") continue;
      const resolved = await person(ctx, id, profile._id);
      result.push({
        id,
        name: resolved.name,
        fullName: resolved.fullName,
        email: target.email,
        avatar: resolved.avatar,
      });
    }
    return result;
  },
});
