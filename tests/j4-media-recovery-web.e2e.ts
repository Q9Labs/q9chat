import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { surfaceOf, test } from "@e2e-dev/web";
import { api } from "@q9chat/convex";
import { expect } from "e2e";

import { browserEngine, devClient, signInDevAccount } from "./support/browser.js";
import { webOrigin } from "./support/origin.js";
import { removeTestUser } from "./support/workos.js";

// A real persistent Chromium profile proves disk-backed bytes, not an exported storage snapshot.
test(
  "journey 4B: browser restart, partial uploads, shared retries and recovery",
  { timeout: 360_000 },
  async ({ app }) => {
    await app.open("/");
    const surface = surfaceOf(browserEngine);
    const engine = surface?.context().browser();
    if (!engine) throw new Error("Missing live browser");
    const browserType = engine.browserType();
    const profile = await mkdtemp(join(tmpdir(), "q9chat-j4b-browser-"));
    let context = await browserType.launchPersistentContext(profile, { headless: true });
    const email = `q9-j4b-recovery-${Date.now()}@example.net`;
    const account = await signInDevAccount(context, email, "Rania Recovery");
    const groupId = await account.client.mutation(api.groups.create, {
      name: "Durable attachments",
      memberIds: [],
      inviteToken: crypto.randomUUID().replaceAll("-", ""),
    });
    const bytes = Buffer.from("Q9 durable bytes\n");
    let page = context.pages()[0] ?? (await context.newPage());
    const errors: string[] = [];
    function observe() {
      page.on("pageerror", (error) => errors.push(error.message));
    }
    async function open() {
      observe();
      await page.goto(`${webOrigin}/?group=${groupId}`);
      await page.getByRole("textbox", { name: "Message", exact: true }).waitFor();
      await page.locator('[role=log][aria-busy="false"]').waitFor();
    }
    async function posts() {
      await devClient(context, account.client);
      return (
        await account.client.query(api.messages.range, {
          groupId,
          fromSequence: 1,
          toSequence: 100,
        })
      ).filter((row) => row.kind === "post");
    }
    const files = () => page.getByLabel("Choose files", { exact: true });
    const retry = () => page.getByRole("button", { name: "Retry", exact: true });
    const selection = (name: string) => ({ name, mimeType: "text/plain", buffer: bytes });
    try {
      await open();
      async function verifyBrowserRestart() {
        await context.setOffline(true);
        await files().setInputFiles(selection("disk.txt"));
        await page.getByText("Waiting for connection", { exact: true }).waitFor();
        await page.screenshot({ path: "artifacts/j4-attachments/waiting-light-wide.png" });
        await context.close();
        context = await browserType.launchPersistentContext(profile, { headless: true });
        page = context.pages()[0] ?? (await context.newPage());
        await open();
        await retry().waitFor();
        await retry().click();
        await expect.poll(async () => (await posts()).length).toBe(1);
        const stored = (await posts())[0];
        expect(stored?.attachments[0]?.kind).toBe("file");
        await expect.poll(() => page.locator("a.file").getAttribute("href")).toMatch(/^blob:/);
        const downloaded = await page
          .locator("a.file")
          .evaluate(async (link) => [
            ...new Uint8Array(await (await fetch(link.getAttribute("href") ?? "")).arrayBuffer()),
          ]);
        expect(downloaded).toEqual([...bytes]);
        process.stdout.write(
          "PASS W12 W13: offline original bytes survive actual persistent-browser shutdown and restart\n",
        );
      }
      await verifyBrowserRestart();

      let uploads = 0;
      await page.route("**/upload", async (route) => {
        if (route.request().method() === "OPTIONS") {
          await route.continue();
          return;
        }
        uploads += 1;
        if (uploads === 2) await route.abort("internetdisconnected");
        else await route.continue();
      });
      await files().setInputFiles([selection("same.txt"), selection("same.txt")]);
      await retry().waitFor();
      expect((await posts()).length).toBe(1);
      await page.unroute("**/upload");
      await page.reload();
      await retry().click();
      await expect.poll(async () => (await posts()).length).toBe(2);
      expect((await posts())[1]?.attachments.map((file) => file.kind)).toEqual(["file", "file"]);
      expect(await page.locator("a.file b").allTextContents()).toEqual([
        "disk.txt",
        "same.txt",
        "same.txt",
      ]);
      process.stdout.write(
        "PASS W14 W22: partial multi-upload never posts a subset; reload retry restores both same-labelled files\n",
      );

      await page.route("**/upload", (route) => route.abort("internetdisconnected"));
      await files().setInputFiles(selection("shared.txt"));
      await retry().waitFor();
      await page.unroute("**/upload");
      const other = await context.newPage();
      await other.goto(`${webOrigin}/?group=${groupId}`);
      await other.getByRole("button", { name: "Retry", exact: true }).waitFor();
      await Promise.all([
        retry().click(),
        other.getByRole("button", { name: "Retry", exact: true }).click(),
      ]);
      await expect.poll(async () => (await posts()).length).toBe(3);
      await page.locator(".mst").waitFor({ state: "detached" });
      await other.locator(".mst").waitFor({ state: "detached" });
      expect(
        (await posts()).filter((post) =>
          post.attachments.some((file) => file.kind === "file" && file.name === "shared.txt"),
        ).length,
      ).toBe(1);
      await other.close();
      process.stdout.write(
        "PASS W15: two same-account tabs retry retained bytes with one original client key and one post\n",
      );

      const field = page.getByRole("textbox", { name: "Message", exact: true });
      await field.fill("Keep the newer draft");
      await page.evaluate(() => {
        // oxlint-disable-next-line typescript/unbound-method -- Saved only for restoration, never called without its receiver.
        const put = IDBObjectStore.prototype.put;
        IDBObjectStore.prototype.put = () => {
          throw new DOMException("Quota exceeded", "QuotaExceededError");
        };
        window.addEventListener(
          "q9-test-restore-storage",
          () => {
            IDBObjectStore.prototype.put = put;
          },
          { once: true },
        );
      });
      await files().setInputFiles(selection("quota.txt"));
      await page.getByRole("alert").filter({ hasText: "Keep this tab open" }).waitFor();
      expect(await field.inputValue()).toBe("Keep the newer draft");
      expect((await posts()).length).toBe(3);
      await page.evaluate(() => window.dispatchEvent(new Event("q9-test-restore-storage")));
      await retry().click();
      await expect.poll(async () => (await posts()).length).toBe(4);
      process.stdout.write(
        "PASS W20 W18: actual IndexedDB quota failure retains bytes in the tab and leaves the text draft; retry succeeds\n",
      );

      await files().setInputFiles({
        name: "max.bin",
        mimeType: "application/octet-stream",
        buffer: Buffer.alloc(20_000_000),
      });
      await expect.poll(async () => (await posts()).length).toBe(5);
      expect((await posts())[4]?.attachments[0]?.size).toBe(20_000_000);
      await files().setInputFiles(Array.from({ length: 11 }, () => selection("too-many.txt")));
      await page.getByRole("alert").filter({ hasText: "one to ten" }).waitFor();
      await files().setInputFiles(selection(`${"x".repeat(201)}.txt`));
      await page.getByRole("alert").filter({ hasText: "200 characters" }).waitFor();
      expect((await posts()).length).toBe(5);
      process.stdout.write(
        "PASS W04: exactly 20,000,000 bytes accepted; eleven files and overlong filenames rejected\n",
      );

      for (const name of ["NotAllowedError", "NotFoundError"]) {
        await page.evaluate((failure) => {
          navigator.mediaDevices.getUserMedia = () =>
            Promise.reject(new DOMException("Test microphone fault", failure));
        }, name);
        await page.getByRole("button", { name: "Record a voice note", exact: true }).click();
        await page
          .getByRole("alert")
          .filter({ hasText: name === "NotAllowedError" ? "denied" : "No microphone" })
          .waitFor();
        expect(await field.inputValue()).toBe("Keep the newer draft");
      }
      expect(errors).toEqual([]);
      process.stdout.write(
        "PASS W09: permission denied and absent input device leave a usable composer without page errors\n",
      );
    } catch (cause) {
      await page.screenshot({ path: "artifacts/j4-attachments/recovery-failure.png" });
      process.stderr.write(
        JSON.stringify(
          await page.evaluate(() => ({
            alerts: [...document.querySelectorAll('[role="alert"]')].map(
              (node) => node.textContent,
            ),
            statuses: [...document.querySelectorAll(".mst")].map((node) => node.textContent),
            online: navigator.onLine,
            location: location.pathname,
          })),
        ) + "\n",
      );
      throw cause;
    } finally {
      await context.setOffline(false);
      await devClient(context, account.client);
      await account.client.mutation(api.profiles.deleteAccount, {});
      await context.close();
      await removeTestUser(email);
      await rm(profile, { recursive: true, force: true });
    }
  },
);
