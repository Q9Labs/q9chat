import { v } from "convex/values";

import { internalMutation, internalQuery } from "./_generated/server";
import { active, member, fail } from "./lib/access";
import { storedUpload } from "./lib/uploads";
export const authorizeUpload = internalQuery({
  args: {},
  handler: async (ctx) => (await active(ctx))._id,
});
export const recordUpload = internalMutation({
  args: storedUpload.fields,
  returns: v.id("uploads"),
  handler: async (ctx, args) => {
    const profile = await active(ctx);
    if (profile._id !== args.ownerId) return fail("account_unavailable");
    return ctx.db.insert("uploads", args);
  },
});
export const messageFile = internalQuery({
  args: { messageId: v.string(), index: v.number() },
  handler: async (ctx, args) => {
    const messageId = ctx.db.normalizeId("messages", args.messageId);
    if (!messageId) return null;
    const { message } = await member(ctx, { messageId });
    if (message?.kind !== "post" || !Number.isSafeInteger(args.index) || args.index < 0)
      return null;
    const file = message.attachments[args.index];
    return file ? { storageId: file.storageId, contentType: file.contentType } : null;
  },
});
export const photo = internalQuery({
  args: { profileId: v.string() },
  handler: async (ctx, args) => {
    await active(ctx);
    const profileId = ctx.db.normalizeId("profiles", args.profileId);
    if (!profileId) return null;
    const profile = await ctx.db.get(profileId);
    return profile?.status === "active" && profile.photoStorageId ? profile.photoStorageId : null;
  },
});
