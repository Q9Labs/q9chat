/// <reference lib="webworker" />

/** @param {unknown} value */
function destination(value) {
  if (typeof value !== "string") throw new Error("Invalid notification destination");
  const url = new URL(value, self.location.origin);
  if (
    url.origin !== self.location.origin ||
    (url.pathname !== "/" && !/^\/g\/[A-Za-z0-9]+$/u.test(url.pathname))
  )
    throw new Error("Invalid notification destination");
  return url.href;
}
/** @param {unknown} value */
function payloadFields(value) {
  if (typeof value !== "object" || value === null) return null;
  if (!("title" in value) || !("body" in value) || !("url" in value)) return null;
  return value;
}
/** @param {unknown} value */
function notificationPayload(value) {
  const fields = payloadFields(value);
  if (!fields) return null;
  if (
    typeof fields.title !== "string" ||
    typeof fields.body !== "string" ||
    typeof fields.url !== "string"
  )
    return null;
  return { title: fields.title, body: fields.body, url: fields.url };
}
if (!(self instanceof ServiceWorkerGlobalScope)) throw new Error("A service worker is required");
const worker = self;

let pending = Promise.resolve();
/** @param {ExtendableEvent} event @param {() => Promise<void>} task */
function enqueue(event, task) {
  const result = pending.then(task);
  pending = result.then(
    () => {},
    () => {},
  );
  event.waitUntil(result);
}
async function deliveryEnabled() {
  const cache = await caches.open("q9chat-notifications");
  return (await (await cache.match("/__notifications__/enabled"))?.text()) === "on";
}
worker.addEventListener("message", (event) => {
  /** @type {unknown} */
  const data = event.data;
  if (
    typeof data !== "object" ||
    data === null ||
    !("type" in data) ||
    data.type !== "stop-notifications"
  )
    return;
  enqueue(event, async () => {
    for (const notification of await worker.registration.getNotifications()) notification.close();
    event.ports[0]?.postMessage("stopped");
  });
});
worker.addEventListener(
  "push",
  /** @param {PushEvent} event */ (event) => {
    enqueue(event, async () => {
      if (!(await deliveryEnabled())) return;
      const payload = notificationPayload(event.data?.json());
      if (!payload || !(await worker.registration.pushManager.getSubscription())) return;
      const url = destination(payload.url);
      await worker.registration.showNotification(payload.title, {
        body: payload.body,
        tag: url,
        data: { url },
      });
    });
  },
);
/** @param {ExtendableEvent} event */
async function renewSubscription(event) {
  if (!("oldSubscription" in event) || !(event.oldSubscription instanceof PushSubscription)) return;
  const key = event.oldSubscription.options.applicationServerKey;
  if (key && !(await worker.registration.pushManager.getSubscription()))
    await worker.registration.pushManager
      .subscribe({ userVisibleOnly: true, applicationServerKey: key })
      .then(
        () => true,
        () => false,
      );
}
async function reconnectClients() {
  const cache = await caches.open("q9chat-notifications");
  await cache.put("/__notifications__/reconnect", new Response("pending"));
  const clients = await worker.clients.matchAll({ type: "window", includeUncontrolled: true });
  if (clients.length === 0)
    await worker.registration.showNotification("Reconnect desktop notifications", {
      body: "Open Q9 Chat to reconnect desktop alerts.",
      tag: "q9chat-reconnect",
      data: { url: worker.location.origin + "/" },
    });
  for (const client of clients) client.postMessage({ type: "subscription-changed" }, []);
}
worker.addEventListener("pushsubscriptionchange", (event) => {
  enqueue(event, async () => {
    if (!(await deliveryEnabled())) return;
    await renewSubscription(event);
    await reconnectClients();
  });
});
worker.addEventListener(
  "notificationclick",
  /** @param {NotificationEvent} event */ (event) => {
    event.notification.close();
    event.waitUntil(
      (async () => {
        if (!(await deliveryEnabled())) return;
        /** @type {unknown} */
        const data = event.notification.data;
        if (typeof data !== "object" || data === null || !("url" in data)) return;
        const url = destination(data.url);
        const clients = await worker.clients.matchAll({
          type: "window",
          includeUncontrolled: true,
        });
        const existing = clients.find(
          (client) => new URL(client.url).origin === self.location.origin,
        );
        if (existing) {
          const navigated = await existing.navigate(url);
          await navigated?.focus();
        } else await worker.clients.openWindow(url);
      })(),
    );
  },
);
