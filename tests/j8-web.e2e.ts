import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { surfaceOf, test } from "@e2e-dev/web";
import { api } from "@q9chat/convex";
import { expect } from "e2e";

import { browserEngine, signInDevAccount } from "./support/browser.js";
import { removeTestUser } from "./support/workos.js";

async function until(predicate: () => Promise<boolean>, label: string) {
  await expect.poll(predicate, { timeout: 45_000, interval: 250, message: label }).toBe(true);
}

function chromeExecutable() {
  const executablePath = process.env["Q9CHAT_CHROME_PATH"];
  return executablePath ? { executablePath } : {};
}

function liveBrowser() {
  const surface = surfaceOf(browserEngine);
  if (!surface) throw new Error("Missing live browser");
  const engine = surface.context().browser();
  if (!engine) throw new Error("Missing browser engine");
  return engine;
}

test(
  "journey 8: enable push, receive a reply and open its message",
  { timeout: 300_000 },
  async ({ app }) => {
    await app.open("/");
    const engine = liveBrowser();
    // Push API is deliberately unavailable in Chromium's incognito test contexts.
    const profileDirectory = await mkdtemp(join(tmpdir(), "q9chat-j8-"));
    const context = await engine.browserType().launchPersistentContext(profileDirectory, {
      headless: false,
      channel: "chrome",
      ...chromeExecutable(),
      ignoreDefaultArgs: ["--disable-background-networking"],
      viewport: { width: 1280, height: 800 },
      recordVideo: { dir: "artifacts/j8/video" },
    });
    const peer = await engine.newContext();
    const stamp = crypto.randomUUID();
    const email = `q9-j8-a-${stamp}@example.net`;
    const peerEmail = `q9-j8-b-${stamp}@example.net`;
    const page = context.pages()[0] ?? (await context.newPage());
    const accounts: Awaited<ReturnType<typeof signInDevAccount>>[] = [];
    try {
      const a = await signInDevAccount(context, email, "Amal Journey");
      accounts.push(a);
      const b = await signInDevAccount(peer, peerEmail, "Bilal Journey");
      accounts.push(b);
      const groupId = await a.client.mutation(api.groups.create, {
        name: "Launch notifications",
        memberIds: [b.id],
        inviteToken: crypto.randomUUID().replaceAll("-", ""),
      });
      const own = await a.client.mutation(api.messages.send, {
        groupId,
        body: "Please reply here",
        attachments: [],
        clientKey: crypto.randomUUID(),
      });
      await page.goto("http://localhost:3000/");
      await page.getByText("Pick a group to read it.").waitFor();
      expect(await page.getByRole("region", { name: "Turn on notifications" }).count()).toBe(0);
      await page.goto(`http://localhost:3000/?group=${groupId}`);
      await page.getByText("Please reply here", { exact: true }).waitFor();
      const banner = page.getByRole("region", { name: "Turn on notifications" });
      await banner.waitFor();
      expect(await page.evaluate(() => Notification.permission)).toBe("default");
      await page.screenshot({ path: "artifacts/j8/after.png" });
      await context.grantPermissions(["notifications"], { origin: "http://localhost:3000" });
      await banner.getByRole("button", { name: "Turn on", exact: true }).click();
      await until(
        () =>
          page.evaluate(async () => {
            const worker = await navigator.serviceWorker.getRegistration("/notifications.js");
            return !!(await worker?.pushManager.getSubscription());
          }),
        "browser push subscription",
      );
      const provider = await page.evaluate(async () => {
        const worker = await navigator.serviceWorker.ready;
        const subscription = await worker.pushManager.getSubscription();
        if (!subscription) throw new Error("Missing browser push subscription");
        return new URL(subscription.endpoint).hostname;
      });
      process.stdout.write(`Browser push provider: ${provider}\n`);
      await banner.waitFor({ state: "hidden" });
      expect(
        await page.evaluate(
          async () => !!(await (await navigator.serviceWorker.ready).pushManager.getSubscription()),
        ),
      ).toBe(true);
      const notificationWorker = context.serviceWorkers()[0];
      if (!notificationWorker) throw new Error("Missing notification service worker");
      await page.evaluate(() => {
        navigator.serviceWorker.addEventListener(
          "message",
          (event: MessageEvent<unknown>) => {
            if (
              typeof event.data === "object" &&
              event.data !== null &&
              "type" in event.data &&
              event.data.type === "subscription-changed"
            )
              document.documentElement.dataset["j8Replacement"] = "received";
          },
          { once: true },
        );
      });
      await notificationWorker.evaluate(
        'self.dispatchEvent(new ExtendableEvent("pushsubscriptionchange"))',
      );
      await until(
        () => page.evaluate(() => document.documentElement.dataset["j8Replacement"] === "received"),
        "subscription replacement reconnect",
      );
      await until(
        () =>
          page.evaluate(async () => {
            const cache = await caches.open("q9chat-notifications");
            return !(await cache.match("/__notifications__/reconnect"));
          }),
        "authenticated subscription synchronization",
      );
      const background = await context.newPage();
      await background.goto("http://localhost:3000/");
      await background.getByText("Pick a group to read it.").waitFor();
      await page.bringToFront();
      await until(
        () =>
          page.evaluate(async () => {
            const locks = await navigator.locks.query();
            return (
              document.hasFocus() &&
              locks.held?.filter((lock) => lock.name === "q9chat-notification-viewing").length === 1
            );
          }),
        "one focused-tab viewing lease",
      );
      expect(await background.evaluate(() => document.hasFocus())).toBe(false);
      await background.close();
      // An older target proves this isn't just opening the newest page.
      for (let index = 0; index < 305; index++)
        // eslint-disable-next-line no-await-in-loop -- Ordered history avoids concurrent mutation conflicts in the shared dev database.
        await b.client.mutation(api.messages.send, {
          groupId,
          body: `Background note ${index}`,
          attachments: [],
          clientKey: crypto.randomUUID(),
        });
      await page.goto("http://localhost:3000/");
      await page.getByText("Pick a group to read it.").waitFor();
      const reply = await b.client.mutation(api.messages.send, {
        groupId,
        body: "The launch needs you",
        replyToId: own.messageId,
        attachments: [],
        clientKey: crypto.randomUUID(),
      });
      await until(
        () =>
          page.evaluate(async () => {
            const worker = await navigator.serviceWorker.ready;
            return (await worker.getNotifications()).some(
              (notification) => notification.body === "The launch needs you",
            );
          }),
        "reply notification",
      );
      await notificationWorker.evaluate(`(async () => {
        const notifications = await self.registration.getNotifications();
        const notification = notifications.find((item) => item.body === "The launch needs you");
        if (!notification) throw new Error("Missing reply notification");
        self.dispatchEvent(new NotificationEvent("notificationclick", { notification }));
      })()`);
      await page.waitForURL(
        (url) =>
          url.searchParams.get("group") === groupId &&
          url.searchParams.get("message") === String(reply.sequence),
      );
      await page.locator(`[data-sequence="${reply.sequence}"]`).waitFor();
      await page.goto(`http://localhost:3000/g/${groupId}?m=${own.sequence}`);
      await page.getByText("Please reply here", { exact: true }).first().waitFor();
      expect(
        await page.locator(`[data-sequence="${own.sequence}"]`).evaluate((node) => {
          const box = node.getBoundingClientRect();
          const log = document.querySelector("[role=log]")?.getBoundingClientRect();
          return log !== undefined && box.top >= log.top && box.bottom <= log.bottom;
        }),
      ).toBe(true);
      await page.screenshot({ path: "artifacts/j8/destination.png" });
      await page.getByRole("button", { name: "Group info", exact: true }).click();
      await page.getByRole("switch", { name: "Mute this group" }).click();
      await until(
        async () =>
          (await page
            .getByRole("switch", { name: "Mute this group" })
            .getAttribute("aria-checked")) === "true",
        "saved mute switch",
      );
      const muted = await a.client.query(api.groups.get, { groupId });
      expect(muted?.status === "member" ? muted.notify : null).toBe("muted");
      await page.screenshot({ path: "artifacts/j8/muted.png" });
      await page.getByRole("button", { name: "Close group info", exact: true }).click();
      await page.getByRole("button", { name: "Account" }).click();
      await page.getByRole("button", { name: "Sign out", exact: true }).click();
      await page.getByRole("button", { name: "Email me a code" }).waitFor();
      expect(
        await page.evaluate(
          async () =>
            (await (await navigator.serviceWorker.ready).pushManager.getSubscription()) === null,
        ),
      ).toBe(true);
      await signInDevAccount(context, email, "Amal Journey");
      await page.goto(`http://localhost:3000/?group=${groupId}`);
      await page
        .getByRole("region", { name: "Turn on notifications" })
        .getByRole("button", { name: "Turn on", exact: true })
        .click();
      await page.getByText("Desktop notifications are on", { exact: true }).waitFor();
      await page.evaluate(() => {
        PushSubscription.prototype.unsubscribe = () => new Promise<boolean>(() => {});
      });
      await page.getByRole("button", { name: "Account" }).click();
      await page.getByRole("button", { name: "Sign out", exact: true }).click();
      await page.getByRole("button", { name: "Email me a code" }).waitFor();
      await page
        .getByText("Signed out. Notification cleanup failed. Quit this browser.", { exact: true })
        .waitFor();
      expect(
        (
          await context.request.post("http://localhost:3000/api/auth/token", {
            headers: { Origin: "http://localhost:3000" },
            data: {},
          })
        ).status(),
      ).toBe(401);
      expect(
        await page.evaluate(async () =>
          (
            await (await caches.open("q9chat-notifications")).match("/__notifications__/enabled")
          )?.text(),
        ),
      ).toBe("off");
      // Reload restores the browser API before disposable-profile cleanup.
      await page.reload();
      await signInDevAccount(context, email, "Amal Journey");
      await page.goto(`http://localhost:3000/?group=${groupId}`);
      await page
        .getByRole("region", { name: "Turn on notifications" })
        .getByRole("button", { name: "Turn on", exact: true })
        .click();
      await page.getByText("Desktop notifications are on", { exact: true }).waitFor();
      await page.getByRole("button", { name: "Account" }).click();
      await page.getByRole("button", { name: "Delete account", exact: true }).click();
      await page
        .getByRole("dialog", { name: "Delete your account?" })
        .getByRole("button", { name: "Delete account", exact: true })
        .click();
      await page.getByRole("button", { name: "Email me a code" }).waitFor();
      expect(
        await page
          .getByText("Signed out. Notification cleanup failed. Quit this browser.", { exact: true })
          .count(),
      ).toBe(0);
      expect(
        await page.evaluate(
          async () =>
            (await (await navigator.serviceWorker.ready).pushManager.getSubscription()) === null,
        ),
      ).toBe(true);
    } catch (error) {
      await page.screenshot({ path: "artifacts/j8/failure.png" });
      throw error;
    } finally {
      const subscriptions = await Promise.allSettled([
        page.evaluate(async () => {
          if (!("serviceWorker" in navigator)) return;
          const worker = await navigator.serviceWorker.getRegistration("/notifications.js");
          const subscription = await worker?.pushManager.getSubscription();
          if (subscription && !(await subscription.unsubscribe()))
            throw new Error("Couldn't clean up the test push subscription");
        }),
      ]);
      const profiles = await Promise.allSettled(
        accounts.map(async ({ client }) => {
          const profile = await client.query(api.profiles.me, {});
          if (profile?.status === "ready") await client.mutation(api.profiles.deleteAccount, {});
        }),
      );
      const users = await Promise.allSettled([removeTestUser(email), removeTestUser(peerEmail)]);
      const browsers = await Promise.allSettled([peer.close(), context.close()]);
      await rm(profileDirectory, { recursive: true });
      expect(
        [...subscriptions, ...profiles, ...users, ...browsers]
          .filter((result) => result.status === "rejected")
          .map((result) => String(result.reason)),
      ).toEqual([]);
    }
  },
);
