import { api, type Id } from "@q9chat/convex";
import { useMutation } from "convex/react";
import { useEffect, useState } from "react";

import { PermissionBanner } from "../screens/sidebar.js";
import {
  desktopDeliveryEnabled,
  setDesktopDelivery,
  desktopPublicKey,
  desktopSubscription,
  pushDetails,
  useDesktopSupport,
} from "./desktop-notifications.js";
import { trackDesktopViewing } from "./notification-viewing.js";

export function Notifications({
  groupId,
  onNotice,
}: {
  readonly groupId: Id<"groups"> | null;
  readonly onNotice: (message: string) => void;
}) {
  const key = desktopPublicKey();
  const register = useMutation(api.devices.registerWeb);
  const viewing = useMutation(api.devices.viewing);
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [later, setLater] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [enabled, setEnabled] = useState(false);
  const supported = useDesktopSupport();

  useEffect((): (() => void) | void => {
    if (!supported) return;
    let active = true;
    const reconnect = () => {
      if (Notification.permission !== "granted") return;
      void desktopDeliveryEnabled()
        .then(async (deliveryEnabled) => {
          if (!deliveryEnabled) return;
          const worker = await navigator.serviceWorker.getRegistration("/notifications.js");
          const subscription = await worker?.pushManager.getSubscription();
          if (!subscription) {
            if (active) {
              setEnabled(false);
              setError("Notifications need reconnecting. Turn on to retry.");
            }
            return;
          }
          await register(pushDetails(subscription));
          await (await caches.open("q9chat-notifications")).delete("/__notifications__/reconnect");
          if (active) {
            setEndpoint(subscription.endpoint);
            setEnabled(true);
          }
          for (const notification of (await worker?.getNotifications({
            tag: "q9chat-reconnect",
          })) ?? [])
            notification.close();
        })
        .catch(() => {
          if (active) {
            setEnabled(false);
            setError("Couldn't reconnect notifications. Turn on to retry.");
          }
        });
    };
    reconnect();
    const changed = (event: MessageEvent<unknown>) => {
      if (
        typeof event.data === "object" &&
        event.data !== null &&
        "type" in event.data &&
        event.data.type === "subscription-changed"
      )
        reconnect();
    };
    navigator.serviceWorker.addEventListener("message", changed);
    return () => {
      active = false;
      navigator.serviceWorker.removeEventListener("message", changed);
    };
  }, [supported, register]);

  useEffect((): (() => void) | void => {
    if (!endpoint) return;
    return trackDesktopViewing(viewing, endpoint, groupId, () =>
      setError("Couldn't update notifications. Check your connection."),
    );
  }, [endpoint, groupId, viewing]);

  async function turnOn() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      if (!key) throw new Error("Desktop notifications aren't available yet. Try again later.");
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setError(
          permission === "denied"
            ? "Notifications are blocked. Allow them in your browser's site settings, then try again."
            : "Notifications weren't enabled. You can try again.",
        );
        return;
      }
      const subscription = await desktopSubscription(key);
      await register(pushDetails(subscription));
      await setDesktopDelivery(true);
      setEndpoint(subscription.endpoint);
      setEnabled(true);
      onNotice("Desktop notifications are on");
    } catch {
      setError(
        key
          ? "Couldn't enable notifications. Check your connection and try again."
          : "Desktop notifications aren't available yet. Try again later.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (!supported || !groupId || later) return null;
  return (
    <div aria-busy={busy}>
      {enabled ? null : (
        <PermissionBanner onLater={() => setLater(true)} onTurnOn={() => void turnOn()} />
      )}
      {error ? <p role="alert">{error}</p> : null}
    </div>
  );
}
