import { api, type Id } from "@q9chat/convex";
import { useMutation } from "convex/react";
import { useEffect, useState } from "react";

import { PermissionBanner } from "../screens/sidebar.js";
import {
  desktopPublicKey,
  desktopSubscription,
  pushDetails,
  useDesktopSupport,
} from "./desktop-notifications.js";

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
    if (!supported || Notification.permission !== "granted") return;
    let active = true;
    void navigator.serviceWorker
      .getRegistration("/notifications.js")
      .then(async (worker) => {
        const subscription = await worker?.pushManager.getSubscription();
        if (!subscription) return;
        await register(pushDetails(subscription));
        if (active) {
          setEndpoint(subscription.endpoint);
          setEnabled(true);
        }
      })
      .catch(() => {
        if (active) setError("Couldn't reconnect notifications. Turn on to retry.");
      });
    return () => {
      active = false;
    };
  }, [supported, register]);

  useEffect((): (() => void) | void => {
    if (!endpoint) return;
    const update = () => {
      void viewing({
        endpoint,
        groupId: document.visibilityState === "visible" && document.hasFocus() ? groupId : null,
      }).catch(() => setError("Couldn't update notifications. Check your connection."));
    };
    update();
    const timer = window.setInterval(update, 30_000);
    document.addEventListener("visibilitychange", update);
    window.addEventListener("focus", update);
    window.addEventListener("blur", update);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", update);
      window.removeEventListener("focus", update);
      window.removeEventListener("blur", update);
    };
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
