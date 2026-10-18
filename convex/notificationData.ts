import { firstName, messageSummary } from "@q9chat/domain";
import { v } from "convex/values";

import { internalQuery } from "./_generated/server";
import { memberships, membership } from "./lib/groups";
import { groupDisplay } from "./lib/presentation";
export const recipients = internalQuery({
  args: { messageId: v.id("messages") },
  handler: async (ctx, args) => {
    const message = await ctx.db.get(args.messageId);
    if (message?.kind !== "post") return [];
    return (await memberships(ctx, message.groupId))
      .filter((row) => row.profileId !== message.authorId)
      .map((row) => row.profileId);
  },
});
export const eligible = internalQuery({
  args: {
    messageId: v.id("messages"),
    profileId: v.id("profiles"),
    deviceId: v.id("devices"),
    needsYou: v.boolean(),
  },
  handler: async (ctx, args) => {
    const profile = await ctx.db.get(args.profileId);
    if (profile?.status !== "active") return null;
    const message = await ctx.db.get(args.messageId);
    if (message?.kind !== "post" || message.authorId === args.profileId) return null;
    const member = await membership(ctx, message.groupId, args.profileId);
    if (!member || member.notify === "muted") return null;
    if (member.notify !== "all" && !args.needsYou) return null;
    const device = await ctx.db.get(args.deviceId);
    if (!device || device.profileId !== args.profileId) return null;
    if (
      device.kind === "web" &&
      device.viewing?.groupId === message.groupId &&
      device.viewing.until > Date.now()
    )
      return null;
    const author = await ctx.db.get(message.authorId);
    const name = author?.status === "active" ? firstName(author.displayName) : "Deleted account";
    const group = await ctx.db.get(message.groupId);
    if (!group) return null;
    const display = await groupDisplay(ctx, group, args.profileId);
    return {
      device,
      payload: {
        title: group.kind === "pair" ? name : `${name} in ${display.title}`,
        body: messageSummary(message),
        url: `/g/${message.groupId}?m=${message.sequence}`,
      },
    };
  },
});
export const devices = internalQuery({
  args: { profileId: v.id("profiles") },
  handler: (ctx, args) =>
    ctx.db
      .query("devices")
      .withIndex("by_profile", (q) => q.eq("profileId", args.profileId))
      .collect(),
});
