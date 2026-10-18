import { v } from "convex/values";

import { query } from "./_generated/server";
import { active } from "./lib/access";
import { memberships } from "./lib/groups";
import { person } from "./lib/presentation";
import { avatar } from "./lib/validators";
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
    const term = args.query.trim().toLocaleLowerCase();
    if (!term) return [];
    const exact = await ctx.db
      .query("profiles")
      .withIndex("by_email", (q) => q.eq("email", term))
      .collect();
    const own = await ctx.db
      .query("memberships")
      .withIndex("by_profile", (q) => q.eq("profileId", profile._id))
      .collect();
    const ids = new Set(exact.filter((row) => row.status === "active").map((row) => row._id));
    for (const row of own)
      for (const member of await memberships(ctx, row.groupId)) ids.add(member.profileId);
    const result = [];
    for (const id of ids) {
      if (id === profile._id) continue;
      const target = await ctx.db.get(id);
      if (!target || target.status !== "active") continue;
      if (
        target.email !== term &&
        !target.displayName.toLocaleLowerCase().startsWith(term) &&
        !target.email.startsWith(term)
      )
        continue;
      const resolved = await person(ctx, id, profile._id);
      result.push({
        id,
        name: resolved.name,
        fullName: resolved.fullName,
        email: target.email,
        avatar: resolved.avatar,
      });
      if (result.length === 4) break;
    }
    return result;
  },
});
