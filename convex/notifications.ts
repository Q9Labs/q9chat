"use node";
import { v } from "convex/values";
import { Effect } from "effect";
import webpush from "web-push";

import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { request, ServiceError } from "./lib/workos";
let loggedMissingVapid = false;
export const deliver = internalAction({
  args: {
    messageId: v.id("messages"),
    recipientIds: v.array(v.id("profiles")),
    needsYouIds: v.array(v.id("profiles")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    for (const profileId of args.recipientIds) {
      const devices = await ctx.runQuery(internal.notificationData.devices, { profileId });
      await Promise.all(devices.map(device => ctx.scheduler.runAfter(0, internal.notifications.dispatch, { messageId: args.messageId, profileId, deviceId: device._id, needsYou: args.needsYouIds.includes(profileId) })));
    }
    return null;
  },
});
export const dispatch = internalAction({
  args: { messageId: v.id("messages"), profileId: v.id("profiles"), deviceId: v.id("devices"), needsYou: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const delivery = await ctx.runQuery(internal.notificationData.eligible, args);
    if (!delivery) return null;
        if (delivery.device.kind === "expo") {
          const response = await Effect.runPromise(
            request("Expo push", "https://exp.host/--/api/v2/push/send", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                to: delivery.device.expoPushToken,
                title: delivery.payload.title,
                body: delivery.payload.body,
                data: { url: delivery.payload.url },
                sound: "default",
              }),
            }),
          );
          if (!response.ok)
            throw new ServiceError({
              operation: "Expo push",
              status: response.status,
              detail: "Push rejected",
            });
        } else {
          const publicKey = process.env["VAPID_PUBLIC_KEY"],
            privateKey = process.env["VAPID_PRIVATE_KEY"],
            subject = process.env["VAPID_SUBJECT"];
          if (!publicKey || !privateKey || !subject) {
            if (!loggedMissingVapid) {
              console.warn("Web push disabled: VAPID environment is incomplete");
              loggedMissingVapid = true;
            }
            return null;
          }
          const details = webpush.generateRequestDetails(
            {
              endpoint: delivery.device.endpoint,
              keys: { p256dh: delivery.device.p256dh, auth: delivery.device.auth },
            },
            JSON.stringify(delivery.payload),
            { vapidDetails: { subject, publicKey, privateKey }, TTL: 3600 },
          );
          const response = await Effect.runPromise(
            request("Web push", details.endpoint, {
              method: details.method,
              headers: details.headers,
              body: new Uint8Array(details.body),
            }),
          );
          if (!response.ok)
            throw new ServiceError({
              operation: "Web push",
              status: response.status,
              detail: "Push rejected",
            });
        }
    return null;
  },
});
