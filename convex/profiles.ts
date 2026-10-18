import { avatarColors } from "@q9chat/domain";
import { v } from "convex/values";
import { Effect } from "effect";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action, mutation, query, internalQuery, internalMutation } from "./_generated/server";
import { anyone, identity, active, fail } from "./lib/access";
import { consume, imageTypes } from "./lib/uploads";
import { getUser } from "./lib/workos";
export const byAuth = internalQuery({
  args: { authUserId: v.string() },
  handler: (ctx, args) =>
    ctx.db
      .query("profiles")
      .withIndex("by_auth_user", (q) => q.eq("authUserId", args.authUserId))
      .unique(),
});
export const me = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({ status: v.literal("needsSetup"), email: v.string(), suggestedName: v.string() }),
    v.object({ status: v.literal("unavailable") }),
    v.object({
      status: v.literal("ready"),
      profile: v.object({
        id: v.id("profiles"),
        displayName: v.string(),
        email: v.string(),
        photo: v.union(v.string(), v.null()),
        color: v.string(),
        lightColor: v.string(),
      }),
    }),
  ),
  handler: async (ctx) => {
    const user = await anyone(ctx);
    if (!user) return null;
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_auth_user", (q) => q.eq("authUserId", user.subject))
      .unique();
    if (!profile)
      return {
        status: "needsSetup" as const,
        email: user.email ?? "",
        suggestedName: user.name ?? [user.givenName, user.familyName].filter(Boolean).join(" "),
      };
    if (profile.status !== "active") return { status: "unavailable" as const };
    return {
      status: "ready" as const,
      profile: {
        id: profile._id,
        displayName: profile.displayName,
        email: profile.email,
        photo: profile.photoStorageId ? `/photos/${profile._id}` : null,
        ...avatarColors(profile._id),
      },
    };
  },
});
export const setUp = action({
  args: { displayName: v.string() },
  returns: v.id("profiles"),
  handler: async (ctx, args): Promise<Id<"profiles">> => {
    const user = await identity(ctx);
    if (!args.displayName.trim()) return fail("name_required");
    const result = await Effect.runPromiseExit(getUser(user.subject));
    if (result._tag === "Failure") return fail("account_unavailable");
    if (result.value.id !== user.subject || !result.value.email_verified)
      return fail("account_unavailable");
    return ctx.runMutation(internal.profiles.finishSetup, {
      authUserId: user.subject,
      email: result.value.email.toLowerCase(),
      displayName: args.displayName.trim(),
    });
  },
});
export const finishSetup = internalMutation({
  args: { authUserId: v.string(), email: v.string(), displayName: v.string() },
  returns: v.id("profiles"),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("profiles")
      .withIndex("by_auth_user", (q) => q.eq("authUserId", args.authUserId))
      .unique();
    if (existing) {
      if (existing.status !== "active") return fail("account_unavailable");
      return existing._id;
    }
    return ctx.db.insert("profiles", { status: "active", ...args });
  },
});
export const update = mutation({
  args: {
    displayName: v.optional(v.string()),
    photoUploadId: v.optional(v.union(v.id("uploads"), v.null())),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const profile = await active(ctx);
    if (args.displayName !== undefined) {
      if (!args.displayName.trim()) return fail("name_required");
      await ctx.db.patch(profile._id, { displayName: args.displayName.trim() });
    }
    if (args.photoUploadId !== undefined) {
      const upload = args.photoUploadId
        ? await consume(ctx, profile._id, args.photoUploadId)
        : null;
      if (upload && !imageTypes.has(upload.contentType)) return fail("bad_attachment");
      if (profile.photoStorageId) await ctx.storage.delete(profile.photoStorageId);
      await ctx.db.patch(profile._id, { photoStorageId: upload?.storageId });
    }
    return null;
  },
});
export const deleteAccount = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const profile = await active(ctx);
    await ctx.db.replace(profile._id, {
      status: "deleting",
      authUserId: profile.authUserId,
      requestedAt: Date.now(),
      lastStepAt: Date.now(),
      ...(profile.photoStorageId ? { photoStorageId: profile.photoStorageId } : {}),
    });
    await ctx.scheduler.runAfter(0, internal.deletion.step, { profileId: profile._id });
    return null;
  },
});
