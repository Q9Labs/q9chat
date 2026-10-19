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

export async function desktopDeliveryEnabled() {
  const cache = await caches.open("q9chat-notifications");
  return (await (await cache.match("/__notifications__/enabled"))?.text()) === "on";
}
export async function setDesktopDelivery(enabled: boolean) {
  const cache = await caches.open("q9chat-notifications");
  await cache.put("/__notifications__/enabled", new Response(enabled ? "on" : "off"));
}
async function drainNotifications(registration: ServiceWorkerRegistration) {
  const worker = registration.active;
  if (!worker) return;
  await new Promise<void>((resolve, reject) => {
    const channel = new MessageChannel();
    const timeout = window.setTimeout(() => {
      channel.port1.close();
      reject(new Error("Notification cleanup timed out"));
    }, 10_000);
    channel.port1.addEventListener(
      "message",
      () => {
        window.clearTimeout(timeout);
        channel.port1.close();
        resolve();
      },
      { once: true },
    );
    channel.port1.start();
    worker.postMessage({ type: "stop-notifications" }, [channel.port2]);
  });
}
async function retireSubscription(
  registration: ServiceWorkerRegistration,
  unregister: (endpoint: string) => Promise<unknown>,
) {
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;
  const [registrationResult, browserResult] = await Promise.allSettled([
    unregister(subscription.endpoint),
    subscription.unsubscribe(),
  ]);
  if (
    registrationResult.status !== "fulfilled" ||
    browserResult.status !== "fulfilled" ||
    !browserResult.value
  )
    throw new Error("Couldn't finish notification cleanup");
}
export async function stopDesktopNotifications(unregister: (endpoint: string) => Promise<unknown>) {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
  await setDesktopDelivery(false);
  const registration = await navigator.serviceWorker.getRegistration("/notifications.js");
  if (!registration) return;
  const results = await Promise.allSettled([
    drainNotifications(registration),
    retireSubscription(registration, unregister),
  ]);
  const failed = results.find((result) => result.status === "rejected");
  if (failed?.status === "rejected")
    throw new Error("Couldn't finish notification cleanup", { cause: failed.reason });
}

export async function signOutWithNotifications(
  stop: () => Promise<void>,
  signOut: () => Promise<void>,
) {
  const cleaned = await stop().then(
    () => true,
    () => false,
  );
  await signOut();
  return cleaned;
}
