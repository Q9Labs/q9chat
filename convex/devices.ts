import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import { mutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { active, fail } from "./lib/access";
async function cap(ctx: MutationCtx, profileId: Id<"profiles">) {
  const rows = await ctx.db
    .query("devices")
    .withIndex("by_profile", (q) => q.eq("profileId", profileId))
    .collect();
  for (const row of rows.slice(0, Math.max(0, rows.length - 10))) await ctx.db.delete(row._id);
}
export const registerExpo = mutation({
  args: { expoPushToken: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const profile = await active(ctx);
    if (!/^(ExponentPushToken|ExpoPushToken)\[[\w-]+\]$/u.test(args.expoPushToken))
      return fail("bad_attachment");
    const row = await ctx.db
      .query("devices")
      .withIndex("by_expo_push_token", (q) => q.eq("expoPushToken", args.expoPushToken))
      .unique();
    const value = {
      kind: "expo" as const,
      profileId: profile._id,
      expoPushToken: args.expoPushToken,
    };
    if (row) await ctx.db.replace(row._id, value);
    else await ctx.db.insert("devices", value);
    await cap(ctx, profile._id);
    return null;
  },
});
export const registerWeb = mutation({
  args: { endpoint: v.string(), p256dh: v.string(), auth: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const profile = await active(ctx);
    let url: URL;
    try {
      url = new URL(args.endpoint);
    } catch {
      return fail("bad_attachment");
    }
    // Only browser push services are dispatch targets; a subscription cannot become an SSRF URL.
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      ![
        "fcm.googleapis.com",
        "updates.push.services.mozilla.com",
        "web.push.apple.com",
        "wns.windows.com",
      ].some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`)) ||
      !/^[A-Za-z0-9_-]+={0,2}$/u.test(args.p256dh) ||
      !/^[A-Za-z0-9_-]+={0,2}$/u.test(args.auth)
    )
      return fail("bad_attachment");
    const row = await ctx.db
      .query("devices")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", args.endpoint))
      .unique();
    const value = { ...args, kind: "web" as const, profileId: profile._id };
    if (row) await ctx.db.replace(row._id, value);
    else await ctx.db.insert("devices", value);
    await cap(ctx, profile._id);
    return null;
  },
});
export const unregister = mutation({
  args: { expoPushToken: v.optional(v.string()), endpoint: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const profile = await active(ctx);
    const rows = await ctx.db
      .query("devices")
      .withIndex("by_profile", (q) => q.eq("profileId", profile._id))
      .collect();
    for (const row of rows)
      if (
        (row.kind === "expo" && row.expoPushToken === args.expoPushToken) ||
        (row.kind === "web" && row.endpoint === args.endpoint)
      )
        await ctx.db.delete(row._id);
    return null;
  },
});
export const viewing = mutation({
  args: { endpoint: v.string(), groupId: v.union(v.id("groups"), v.null()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const profile = await active(ctx);
    const row = await ctx.db
      .query("devices")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", args.endpoint))
      .unique();
    if (row?.kind === "web" && row.profileId === profile._id)
      await ctx.db.patch(row._id, {
        viewing: args.groupId ? { groupId: args.groupId, until: Date.now() + 60000 } : undefined,
      });
    return null;
  },
});
