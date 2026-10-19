/// <reference lib="webworker" />

/** @param {unknown} value */
function destination(value) {
  if (typeof value !== "string") throw new Error("Invalid notification destination");
  const url = new URL(value, self.location.origin);
  if (url.origin !== self.location.origin || !/^\/g\/[A-Za-z0-9]+$/u.test(url.pathname))
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

worker.addEventListener(
  "push",
  /** @param {PushEvent} event */ (event) => {
    event.waitUntil(
      (async () => {
        const payload = notificationPayload(event.data?.json());
        if (!payload) return;
        const url = destination(payload.url);
        // Unsubscribing on sign-out also makes queued pushes harmless.
        if (!(await worker.registration.pushManager.getSubscription())) return;
        await worker.registration.showNotification(payload.title, {
          body: payload.body,
          tag: url,
          data: { url },
        });
      })(),
    );
  },
);
worker.addEventListener(
  "notificationclick",
  /** @param {NotificationEvent} event */ (event) => {
    event.notification.close();
    event.waitUntil(
      (async () => {
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
