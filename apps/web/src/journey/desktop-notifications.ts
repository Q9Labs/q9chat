import { useSyncExternalStore } from "react";

function supported() {
  return (
    typeof window !== "undefined" &&
    "Notification" in window &&
    "serviceWorker" in navigator &&
    "PushManager" in window
  );
}
function subscribe() {
  return () => {};
}
function serverSupport() {
  return false;
}
export function useDesktopSupport() {
  return useSyncExternalStore(subscribe, supported, serverSupport);
}
export function desktopPublicKey() {
  const value: unknown = import.meta.env["VITE_VAPID_PUBLIC_KEY"];
  return typeof value === "string" ? value : null;
}
export function pushDetails(subscription: PushSubscription) {
  const { keys } = subscription.toJSON();
  if (!keys?.["p256dh"] || !keys["auth"])
    throw new Error("Couldn't read the browser push subscription");
  return { endpoint: subscription.endpoint, p256dh: keys["p256dh"], auth: keys["auth"] };
}
export async function desktopSubscription(key: string) {
  await navigator.serviceWorker.register("/notifications.js");
  const worker = await navigator.serviceWorker.ready;
  const applicationServerKey = Uint8Array.from(
    atob(key.replaceAll("-", "+").replaceAll("_", "/")),
    (char) => char.charCodeAt(0),
  );
  return (
    (await worker.pushManager.getSubscription()) ??
    worker.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })
  );
}

export async function stopDesktopNotifications() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
  const registration = await navigator.serviceWorker.getRegistration("/notifications.js");
  const subscription = await registration?.pushManager.getSubscription();
  if (subscription && !(await subscription.unsubscribe()))
    throw new Error("Couldn't turn off notifications for this browser");
  for (const notification of (await registration?.getNotifications()) ?? []) notification.close();
}
