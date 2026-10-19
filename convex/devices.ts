import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import { mutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { active } from "./lib/access";
function decode(value: string) {
  try {
    return Uint8Array.from(atob(value.replaceAll("-", "+").replaceAll("_", "/")), (char) =>
      char.charCodeAt(0),
    );
  } catch {
    throw new Error("Invalid push subscription");
  }
}
async function validateKeys(p256dh: string, auth: string) {
  if (!/^[A-Za-z0-9_-]+={0,2}$/u.test(p256dh) || !/^[A-Za-z0-9_-]+={0,2}$/u.test(auth))
    throw new Error("Invalid push subscription");
  const publicKey = decode(p256dh);
  if (publicKey.length !== 65 || publicKey[0] !== 4 || decode(auth).length !== 16)
    throw new Error("Invalid push subscription");
  try {
    await crypto.subtle.importKey(
      "raw",
      publicKey,
      { name: "ECDH", namedCurve: "P-256" },
      false,
      [],
    );
  } catch {
    throw new Error("Invalid push subscription");
  }
}
function validateWeb(endpoint: string) {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    throw new Error("Invalid push subscription");
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
      "notify.windows.com",
    ].some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))
  )
    throw new Error("Invalid push subscription");
}
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
    if (args.expoPushToken.length > 200) throw new Error("Push token exceeds 200 characters");
    if (!/^(ExponentPushToken|ExpoPushToken)\[[\w-]+\]$/u.test(args.expoPushToken))
      throw new Error("Invalid push subscription");
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
    if (args.endpoint.length > 2000 || args.p256dh.length > 200 || args.auth.length > 200)
      throw new Error("Push subscription exceeds its limits");
    validateWeb(args.endpoint);
    await validateKeys(args.p256dh, args.auth);
    const row = await ctx.db
      .query("devices")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", args.endpoint))
      .unique();
    const value = { ...args, kind: "web" as const, profileId: profile._id };
    if (row?.kind === "web" && row.profileId === profile._id) await ctx.db.patch(row._id, args);
    else if (row) await ctx.db.replace(row._id, value);
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
    if ((args.endpoint?.length ?? 0) > 2000 || (args.expoPushToken?.length ?? 0) > 200)
      throw new Error("Push subscription exceeds its limits");
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
    if (args.endpoint.length > 2000) throw new Error("Push endpoint exceeds 2000 characters");
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
