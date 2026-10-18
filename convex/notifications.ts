"use node";
import { v } from "convex/values";
import { Effect, Schedule, Schema } from "effect";
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
      await Promise.all(
        devices.map((device) =>
          ctx.scheduler.runAfter(0, internal.notifications.dispatch, {
            messageId: args.messageId,
            profileId,
            deviceId: device._id,
            needsYou: args.needsYouIds.includes(profileId),
          }),
        ),
      );
    }
    return null;
  },
});
export const dispatch = internalAction({
  args: {
    messageId: v.id("messages"),
    profileId: v.id("profiles"),
    deviceId: v.id("devices"),
    needsYou: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const attempt = Effect.gen(function* () {
      const delivery = yield* Effect.promise(() =>
        ctx.runQuery(internal.notificationData.eligible, args),
      );
      if (!delivery) return;
      const discard = () =>
        ctx.runMutation(internal.notificationData.discardDevice, {
          deviceId: args.deviceId,
          profileId: args.profileId,
          token:
            delivery.device.kind === "expo"
              ? delivery.device.expoPushToken
              : delivery.device.endpoint,
        });
      let response: Response;
      if (delivery.device.kind === "expo") {
        response = yield* request("Expo push", "https://exp.host/--/api/v2/push/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: delivery.device.expoPushToken,
            title: delivery.payload.title,
            body: delivery.payload.body,
            data: { url: delivery.payload.url },
            sound: "default",
          }),
        });
        if (response.ok) {
          const ticket = yield* Effect.tryPromise({
            try: () => response.json(),
            catch: () =>
              new ServiceError({ operation: "Expo ticket", status: 400, detail: "Invalid JSON" }),
          }).pipe(
            Effect.flatMap(
              Schema.decodeUnknown(
                Schema.Struct({
                  data: Schema.Struct({
                    status: Schema.Literal("ok", "error"),
                    details: Schema.optional(Schema.Struct({ error: Schema.String })),
                  }),
                }),
              ),
            ),
            Effect.mapError(
              () =>
                new ServiceError({
                  operation: "Expo ticket",
                  status: 400,
                  detail: "Invalid ticket",
                }),
            ),
          );
          // v1 handles immediate tickets only; receipt polling is deliberately deferred.
          if (ticket.data.status === "error") {
            if (ticket.data.details?.error === "DeviceNotRegistered") {
              yield* Effect.promise(discard);
              return;
            }
            yield* Effect.fail(
              new ServiceError({
                operation: "Expo ticket",
                status: 400,
                detail: ticket.data.details?.error ?? "Push rejected",
              }),
            );
          }
        }
      } else {
        const publicKey = process.env["VAPID_PUBLIC_KEY"],
          privateKey = process.env["VAPID_PRIVATE_KEY"],
          subject = process.env["VAPID_SUBJECT"];
        if (!publicKey || !privateKey || !subject) {
          if (!loggedMissingVapid) {
            console.warn("Web push disabled: VAPID environment is incomplete");
            loggedMissingVapid = true;
          }
          return;
        }
        const details = webpush.generateRequestDetails(
          {
            endpoint: delivery.device.endpoint,
            keys: { p256dh: delivery.device.p256dh, auth: delivery.device.auth },
          },
          JSON.stringify(delivery.payload),
          { vapidDetails: { subject, publicKey, privateKey }, TTL: 3600 },
        );
        response = yield* request("Web push", details.endpoint, {
          method: details.method,
          headers: details.headers,
          body: new Uint8Array(details.body),
        });
        if (response.status === 404 || response.status === 410) {
          yield* Effect.promise(discard);
          return;
        }
      }
      if (!response.ok)
        yield* Effect.fail(
          new ServiceError({ operation: "Push", status: response.status, detail: "Push rejected" }),
        );
    });
    await Effect.runPromise(
      attempt.pipe(
        Effect.retry({
          schedule: Schedule.exponential("100 millis"),
          times: 2,
          while: (error) => error.status === 0 || error.status >= 500,
        }),
      ),
    );
    return null;
  },
});
