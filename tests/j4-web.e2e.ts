import { surfaceOf, test } from "@e2e-dev/web";
import { api } from "@q9chat/convex";
import type { ConvexHttpClient } from "convex/browser";
import { expect } from "e2e";

import { browserEngine, devClient, signInDevAccount } from "./support/browser.js";
import { webOrigin } from "./support/origin.js";
import { sendWire } from "./support/send-wire.js";
import { removeTestUser } from "./support/workos.js";

type Context = ReturnType<NonNullable<ReturnType<typeof surfaceOf>>["context"]>;

function liveBrowser() {
  const surface = surfaceOf(browserEngine);
  if (!surface) throw new Error("Missing live e2e surface");
  const engine = surface.context().browser();
  if (!engine) throw new Error("Missing live browser");
  return { surface, engine };
}

test(
  "journey 4: text sends, durable drafts, retry keys and sender typing",
  { timeout: 360_000 },
  async ({ app, browser }) => {
    const { surface, engine } = liveBrowser();
    await app.open("/");
    const page = surface.page();
    async function reload() {
      // Convex's pending-mutation warning must not cancel an intentional restart.
      const removeDialogHandler = await browser.onDialog("accept");
      try {
        await page.reload({ waitUntil: "commit" });
      } finally {
        await removeDialogHandler();
      }
    }
    const wire = await sendWire(page);
    const addresses: string[] = [];
    const clients: { readonly context: Context; readonly client: ConvexHttpClient }[] = [];
    const peer = await engine.newContext({
      viewport: { width: 1280, height: 800 },
      reducedMotion: "reduce",
      colorScheme: "light",
    });
    const stamp = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
    async function account(name: string, context: Context) {
      const email = `q9-j4-${name.toLowerCase()}-${stamp}@example.net`;
      addresses.push(email);
      const result = await signInDevAccount(context, email, `${name} Journey`);
      clients.push({ client: result.client, context });
      return result;
    }
    const shot = (name: string) => page.screenshot({ path: `artifacts/j4-text/live-${name}.png` });
    async function cleanup() {
      const profiles = await Promise.allSettled(
        clients.map(async ({ context, client }) => {
          await devClient(context, client);
          await client.mutation(api.profiles.deleteAccount, {});
        }),
      );
      const resources = await Promise.allSettled([peer.close(), ...addresses.map(removeTestUser)]);
      const failures = [...profiles, ...resources].flatMap((result) =>
        result.status === "rejected" ? [String(result.reason)] : [],
      );
      expect(failures).toEqual([]);
    }
    try {
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
      const a = await account("Amira", surface.context());
      const b = await account("Bilal", peer);
      const groupId = await a.client.mutation(api.groups.create, {
        name: "Launch conversation",
        memberIds: [b.id],
        inviteToken: crypto.randomUUID().replaceAll("-", ""),
      });
      await a.client.mutation(api.groups.create, {
        name: "Another conversation",
        memberIds: [b.id],
        inviteToken: crypto.randomUUID().replaceAll("-", ""),
      });
      await app.open(`/?group=${groupId}`);
      const field = page.getByRole("textbox", { name: "Message", exact: true });
      await field.waitFor();
      await page.locator('[role=log][aria-busy="false"]').waitFor();
      await shot("empty");
      const peerPage = await peer.newPage();
      await peerPage.goto(`${webOrigin}/?group=${groupId}`);
      await peerPage.getByRole("textbox", { name: "Message", exact: true }).waitFor();
      async function typingVisible() {
        await peerPage.getByText("Amira is typing", { exact: true }).waitFor();
      }
      async function typingCleared() {
        await peerPage.locator(".typing").waitFor({ state: "detached" });
        expect(await b.client.query(api.typing.list, { groupId })).toEqual([]);
      }
      async function posts() {
        return a.client.query(api.messages.range, { groupId, fromSequence: 1, toSequence: 100 });
      }
      async function committed(body: string) {
        await expect
          .poll(
            async () =>
              (await posts()).filter((row) => row.kind === "post" && row.body === body).length,
          )
          .toBe(1);
        await page
          .locator(".msg")
          .filter({ hasText: body })
          .locator(".mst")
          .waitFor({ state: "detached" });
        expect(await page.locator(".txt").filter({ hasText: body }).count()).toBe(1);
      }
      await field.fill("Trying sign in with Apple now.");
      await typingVisible();
      await shot("typing");
      await field.press("Shift+Enter");
      await field.press("End");
      await field.type("A second line.");
      expect(await field.inputValue()).toBe("Trying sign in with Apple now.\nA second line.");
      expect((await posts()).filter((row) => row.kind === "post").length).toBe(0);
      wire.set("hold");
      await field.press("Enter");
      await page.getByText("Sending", { exact: true }).waitFor();
      await typingCleared();
      const pending = page.locator(".msg.sending");
      await pending.evaluate((node) => {
        node.setAttribute("data-j4-identity", "original");
      });
      await shot("pending");
      await field.press("Enter");
      expect(wire.sends.length).toBe(1);
      wire.release();
      const firstBody = "Trying sign in with Apple now.\nA second line.";
      await committed(firstBody);
      expect(await page.locator('[data-j4-identity="original"]').count()).toBe(1);
      expect(await page.locator(".arrival-announcement").textContent()).toBe("");
      await shot("sent");
      process.stdout.write(
        "J4 PASS: Enter sends once; Shift+Enter inserts newline; pending bubble reconciles without remount; own send is not announced; second client typing clears on send\n",
      );

      await field.fill("Draft for launch");
      await typingVisible();
      await page.getByText("Another conversation", { exact: true }).first().click();
      await typingCleared();
      expect(await field.inputValue()).toBe("");
      await field.fill("Draft for another group");
      await page.getByText("Launch conversation", { exact: true }).first().click();
      expect(await field.inputValue()).toBe("Draft for launch");
      await reload();
      await field.waitFor();
      expect(await field.inputValue()).toBe("Draft for launch");
      await page.getByText("Another conversation", { exact: true }).first().click();
      expect(await field.inputValue()).toBe("Draft for another group");
      await page.getByText("Launch conversation", { exact: true }).first().click();
      await field.fill("");
      process.stdout.write("J4 PASS: per-group drafts survive group switches and reload\n");

      wire.set("fail-before");
      await field.fill("A rejected send");
      await field.press("Enter");
      await page.getByText("Not sent ·", { exact: false }).waitFor();
      const failureStatus = page.getByRole("status", { name: "Send status", exact: true });
      expect(await failureStatus.textContent()).toBe("Message not sent. Retry.");
      expect(await failureStatus.getAttribute("aria-live")).toBe("polite");
      expect(await page.locator('[role=log] [aria-label="Send status"]').count()).toBe(0);
      const rejectedKey = wire.sends.at(-1)?.clientKey;
      await shot("failed");
      await reload();
      await page.getByRole("button", { name: "Retry", exact: true }).waitFor();
      await page.getByRole("button", { name: "Retry", exact: true }).focus();
      await page.keyboard.press("Enter");
      await committed("A rejected send");
      expect(wire.sends.at(-1)?.clientKey).toBe(rejectedKey);
      process.stdout.write(
        "J4 PASS: failed state survives restart; Retry reuses the original clientKey and commits once\n",
      );

      wire.set("fail-committed");
      await field.fill("A committed send with a lost acknowledgement");
      await field.press("Enter");
      await page.getByRole("button", { name: "Retry", exact: true }).waitFor();
      const lostKey = wire.sends.at(-1)?.clientKey;
      expect(
        (await posts()).filter((row) => row.kind === "post" && row.clientKey === lostKey).length,
      ).toBe(1);
      await page.getByRole("button", { name: "Retry", exact: true }).focus();
      await page.keyboard.press("Enter");
      await committed("A committed send with a lost acknowledgement");
      expect(wire.sends.filter((post) => post.clientKey === lostKey).length).toBe(2);
      expect(
        (await posts()).filter((row) => row.kind === "post" && row.clientKey === lostKey).length,
      ).toBe(1);
      process.stdout.write(
        "J4 PASS: first committed response forced to fail; retry sends the same clientKey twice but stores and renders one post\n",
      );

      async function verifyConcurrentSends() {
        const bodies = ["First overlapping send", "Second overlapping send"];
        wire.set("hold");
        for (const body of bodies) {
          await field.fill(body);
          await field.press("Enter");
        }
        expect(await page.locator(".msg.sending").count()).toBe(2);
        expect(new Set(wire.sends.slice(-2).map((post) => post.clientKey)).size).toBe(2);
        await field.fill("Draft written while both sends are pending");
        wire.release();
        await Promise.all(bodies.map(committed));
        expect(await field.inputValue()).toBe("Draft written while both sends are pending");
        await expect.poll(() => page.locator(".msg.sending").count()).toBe(0);
        await field.fill("");
        process.stdout.write(
          "J4 PASS: overlapping sends have distinct keys, each reconcile once, and preserve a newer draft\n",
        );
      }
      await verifyConcurrentSends();

      await field.fill(" ");
      await field.press("Enter");
      expect(await field.inputValue()).toBe(" ");
      const beforeLimit = wire.sends.length;
      await field.fill("x".repeat(4001));
      await page.getByRole("alert").filter({ hasText: "Use 4,000 characters or fewer." }).waitFor();
      await field.press("Enter");
      expect(wire.sends.length).toBe(beforeLimit);
      await field.fill("x".repeat(4000) + "\n  ");
      expect(await field.getAttribute("aria-invalid")).toBe(null);
      expect(await page.getByRole("button", { name: "Send", exact: true }).isEnabled()).toBe(true);
      await field.press("Enter");
      await committed("x".repeat(4000));
      process.stdout.write(
        "J4 PASS: blank text is not sent; 4,001 characters rejected with copy; 4,000 accepted\n",
      );

      const typingStarts = wire.starts.length;
      await field.fill("throttled typing");
      await typingVisible();
      await field.type(" more text");
      expect(wire.starts.length - typingStarts).toBe(1);
      await page.waitForTimeout(3100);
      await field.type(" still typing");
      await expect.poll(() => wire.starts.length - typingStarts).toBe(2);
      const recentStarts = wire.starts.slice(-2);
      expect((recentStarts[1] ?? 0) - (recentStarts[0] ?? 0) >= 2900).toBe(true);
      process.stdout.write(
        "J4 PASS: repeated input throttles typing.start to one call per approximately 3 seconds\n",
      );
      await field.fill("clear typing");
      await typingVisible();
      await field.fill("");
      await typingCleared();
      await field.fill("blur typing");
      await typingVisible();
      await page
        .getByRole("button", { name: "Group info for Launch conversation", exact: true })
        .focus();
      await typingCleared();
      await field.fill("switch typing");
      await field.focus();
      // Focus does not type; the next real input restarts the indicator after blur.
      await field.type(" again");
      await typingVisible();
      await page.getByText("Another conversation", { exact: true }).first().click();
      await typingCleared();
      await page.getByText("Launch conversation", { exact: true }).first().click();
      await field.fill("");
      process.stdout.write("J4 PASS: sender typing stops on clear, blur and group switch\n");

      wire.failTyping("start");
      await field.fill("Typing start failure");
      await page.getByRole("alert").waitFor();
      await field.fill("");
      await page.getByRole("alert").waitFor({ state: "detached" });
      await field.fill("Typing stop failure");
      await typingVisible();
      wire.failTyping("stop");
      await field.fill("");
      await page.getByRole("alert").waitFor();
      await field.fill("Recovered typing");
      await page.getByRole("alert").waitFor({ state: "detached" });
      await typingVisible();
      await page.evaluate(() => {
        window.dispatchEvent(new PageTransitionEvent("pagehide"));
      });
      await typingCleared();
      await field.fill("");
      // Actual tab close can drop the final WebSocket request; expiry remains the guarantee.
      const closing = await surface.context().newPage();
      const closingWire = await sendWire(closing);
      await closing.goto(`${webOrigin}/?group=${groupId}`);
      await closing
        .getByRole("textbox", { name: "Message", exact: true })
        .fill("Closing this typing tab");
      await typingVisible();
      closingWire.failTyping("stop");
      const closedAt = Date.now();
      await closing.close();
      await peerPage.locator(".typing").waitFor({ state: "detached", timeout: 7000 });
      // Time alone does not invalidate a cached Convex query; expiry is rendered locally.
      const remainingTyping = await b.client.query(api.typing.list, { groupId });
      expect(remainingTyping.every((row) => row.expiresAt <= Date.now())).toBe(true);
      process.stdout.write(
        `J4 PASS: typing errors clear after successful start/stop; pagehide stops promptly; actual tab close clears within expiry (${Date.now() - closedAt}ms observed, not a delivery guarantee)\n`,
      );

      async function verifyOffWindowDelivery() {
        const delayedGroup = await a.client.mutation(api.groups.create, {
          name: "Delayed send history",
          memberIds: [b.id],
          inviteToken: crypto.randomUUID().replaceAll("-", ""),
        });
        for (let from = 0; from < 305; from += 5) {
          await Promise.all(
            Array.from({ length: 5 }, (_, index) =>
              a.client.mutation(
                api.messages.send,
                {
                  groupId: delayedGroup,
                  body: `History ${from + index}`,
                  clientKey: crypto.randomUUID(),
                  attachments: [],
                },
                { skipQueue: true },
              ),
            ),
          );
        }
        await app.open(`/?group=${delayedGroup}`);
        await page.locator('[role=log][aria-busy="false"]').waitFor();
        wire.set("hold");
        await field.fill("Delivered while reading older history");
        await field.press("Enter");
        await page.getByText("Sending", { exact: true }).waitFor();
        for (let turn = 0; turn < 2; turn++) {
          const firstId = await page.locator("[role=log] .msg").first().getAttribute("id");
          await page.locator("[role=log]").evaluate((log) => {
            log.scrollTop = 0;
          });
          await page.waitForFunction(
            (id) => document.querySelector("[role=log] .msg")?.id !== id,
            firstId,
          );
          await page.locator('[role=log][aria-busy="false"]').waitFor();
        }
        expect(
          await page.locator("[role=log] [data-sequence]").last().getAttribute("data-sequence"),
        ).toBe("300");
        wire.release();
        await expect
          .poll(() =>
            page.evaluate(
              (prefix) => Object.keys(localStorage).filter((key) => key.startsWith(prefix)).length,
              `q9chat:text:${a.id}:${delayedGroup}:pending:`,
            ),
          )
          .toBe(0);
        await reload();
        await page.getByText("Delivered while reading older history", { exact: true }).waitFor();
        expect(await page.getByRole("button", { name: "Retry", exact: true }).count()).toBe(0);
        const deliveredRows = await a.client.query(api.messages.range, {
          groupId: delayedGroup,
          fromSequence: 301,
          toSequence: 400,
        });
        expect(
          deliveredRows.filter(
            (row) => row.kind === "post" && row.body === "Delivered while reading older history",
          ).length,
        ).toBe(1);
        process.stdout.write(
          "J4 PASS: delivery while paged away clears durable pending state; reload shows one sent post, not a false failure\n",
        );
      }

      // Sending from a held older position must return to the latest, keeping composer focus.
      await page.locator("[role=log]").evaluate((log) => {
        log.scrollTop = 0;
      });
      await field.fill("Return to latest on send");
      await field.press("Enter");
      await committed("Return to latest on send");
      await page.waitForFunction(() => {
        const log = document.querySelector("[role=log]");
        return log && log.scrollHeight - log.scrollTop - log.clientHeight <= 1;
      });
      expect(await field.evaluate((node) => node === document.activeElement)).toBe(true);
      await verifyOffWindowDelivery();
      await page.setViewportSize({ width: 390, height: 844 });
      await shot("phone");
      await page.emulateMedia({ colorScheme: "dark" });
      await shot("phone-dark");
      process.stdout.write("J4 PASS: send returns to latest without stealing composer focus\n");
    } finally {
      wire.release();
      await cleanup();
      process.stdout.write(
        "J4 cleanup: test profiles deleted; reserved WorkOS users removed; peer context closed\n",
      );
    }
  },
);
