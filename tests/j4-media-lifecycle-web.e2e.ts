import { readFile } from "node:fs/promises";

import { surfaceOf, test } from "@e2e-dev/web";
import { api, type Id } from "@q9chat/convex";
import { expect } from "e2e";
import { Schema } from "effect";

import { Session } from "../apps/web/src/lib/auth/contracts.js";
import { browserEngine, signInDevAccount } from "./support/browser.js";
import { webOrigin } from "./support/origin.js";
import { removeTestUser } from "./support/workos.js";

const uploadResult = Schema.Struct({
  uploadId: Schema.String.pipe(
    Schema.filter((id): id is Id<"uploads"> => /^[a-z0-9]{32}$/u.test(id)),
  ),
});

test(
  "journey 4B: activation-only bytes, bounded lifetime and real playback recovery",
  { timeout: 240_000 },
  async ({ app, browser }) => {
    await app.open("/");
    const surface = surfaceOf(browserEngine);
    if (!surface) throw new Error("Missing browser");
    const page = surface.page();
    const dismissDialogs = await browser.onDialog("accept");
    const context = surface.context();
    await browser.setViewport({ width: 1440, height: 900 });
    const email = `q9-j4b-lifetime-${crypto.randomUUID()}@example.net`;
    const account = await signInDevAccount(surface.context(), email, "Layla Lifecycle");
    const groupId = await account.client.mutation(api.groups.create, {
      name: "Private bytes",
      memberIds: [],
      inviteToken: crypto.randomUUID().replaceAll("-", ""),
    });
    const session = Schema.decodeUnknownSync(Session)(
      await (
        await context.request.post(`${webOrigin}/api/auth/token`, {
          headers: { Origin: webOrigin },
          data: {},
        })
      ).json(),
    );
    async function upload(buffer: Buffer) {
      const response = await context.request.post("https://quixotic-crab-23.convex.site/upload", {
        headers: { Authorization: `Bearer ${session.accessToken}` },
        data: buffer,
      });
      expect(response.status()).toBe(200);
      return Schema.decodeUnknownSync(uploadResult)(await response.json()).uploadId;
    }
    try {
      const files = await Promise.all(
        Array.from({ length: 10 }, async (_, index) => ({
          kind: "file" as const,
          uploadId: await upload(Buffer.from(`private-${index}`)),
          name: `private-${index}.txt`,
        })),
      );
      await account.client.mutation(api.messages.send, {
        groupId,
        clientKey: crypto.randomUUID(),
        body: "",
        attachments: files,
      });
      // Signature-valid but unplayable bytes exercise browser decode failure, not a fabricated play state.
      const broken = await upload(Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3, 4]));
      await account.client.mutation(api.messages.send, {
        groupId,
        clientKey: crypto.randomUUID(),
        body: "",
        attachments: [{ kind: "voice", uploadId: broken, durationMs: 1000, waveform: [0.4] }],
      });
      await app.open(`/?group=${groupId}`);
      await page.getByRole("textbox", { name: "Message", exact: true }).waitFor();
      await page.evaluate(() => {
        navigator.mediaDevices.getUserMedia = async () => {
          const inputContext = new AudioContext();
          const destination = inputContext.createMediaStreamDestination();
          const oscillator = inputContext.createOscillator();
          oscillator.connect(destination);
          oscillator.start();
          destination.stream.getTracks().forEach((track) =>
            track.addEventListener("ended", () => {
              oscillator.stop();
              void inputContext.close();
            }),
          );
          return destination.stream;
        };
      });
      for (let note = 0; note < 2; note++) {
        await page.getByRole("button", { name: "Record a voice note", exact: true }).click();
        await page.getByText("Recording", { exact: true }).waitFor();
        await page.waitForTimeout(1200);
        await page.getByRole("button", { name: "Send voice note", exact: true }).click();
        await expect.poll(() => page.locator("audio").count()).toBe(note + 2);
        await page.locator(".mst").waitFor({ state: "detached" });
      }
      await page.addInitScript(() => {
        const created: string[] = [],
          revoked: string[] = [];
        let aborted = 0;
        const create = URL.createObjectURL.bind(URL),
          revoke = URL.revokeObjectURL.bind(URL),
          nativeFetch = window.fetch.bind(window);
        URL.createObjectURL = (blob) => {
          const url = create(blob);
          created.push(url);
          return url;
        };
        URL.revokeObjectURL = (url) => {
          revoked.push(url);
          revoke(url);
        };
        window.fetch = (input, init) => {
          init?.signal?.addEventListener("abort", () => {
            aborted++;
          });
          return nativeFetch(input, init);
        };
        window.addEventListener("q9-resources", () => {
          document.documentElement.dataset["resources"] = JSON.stringify({
            created: created.length,
            active: created.filter((url) => !revoked.includes(url)).length,
            revoked: revoked.length,
            aborted,
          });
        });
      });
      const gets: string[] = [];
      const authorization: boolean[] = [];
      page.on("request", (request) => {
        if (request.method() === "GET" && new URL(request.url()).pathname.startsWith("/files/")) {
          void request
            .allHeaders()
            .then((headers) =>
              authorization.push(
                headers["authorization"]?.startsWith("Bearer ") === true &&
                  new URL(request.url()).search === "",
              ),
            );
          gets.push(request.url());
        }
      });
      await page.reload({ waitUntil: "commit" });
      await page.locator('[role=log][aria-busy="false"]').waitFor();
      await page.getByRole("button", { name: "Play voice note", exact: true }).last().waitFor();
      await page.waitForTimeout(300);
      process.stdout.write(`Initial GETs: ${JSON.stringify(gets)}\n`);
      expect(gets.length).toBe(0);
      for (let index = 0; index < 9; index++) {
        const downloadEvent = page.waitForEvent("download");
        const link = page.getByRole("link", { name: `private-${index}.txt`, exact: false });
        await link.focus();
        await page.keyboard.press("Enter");
        const download = await downloadEvent;
        const path = await download.path();
        if (!path) throw new Error("Missing download");
        expect((await readFile(path)).toString()).toBe(`private-${index}`);
        expect(gets.length).toBe(index + 1);
      }
      await expect.poll(() => authorization.length).toBe(gets.length);
      expect(authorization.every(Boolean)).toBe(true);
      await page.evaluate(() => window.dispatchEvent(new Event("q9-resources")));
      expect(await page.locator("html").getAttribute("data-resources")).toContain('"active":9');
      expect(await page.locator("html").getAttribute("data-resources")).toContain('"revoked":0');
      const voices = page.locator(".voice");
      await voices.first().getByRole("button", { name: "Play voice note" }).click();
      await page.getByRole("alert").filter({ hasText: "Couldn't play" }).waitFor();
      const brokenDownload = page.waitForEvent("download");
      await voices.first().getByRole("link", { name: "Download voice note" }).click();
      expect((await brokenDownload).suggestedFilename()).toContain("voice-note");
      await page.evaluate(() => {
        // oxlint-disable-next-line typescript/unbound-method -- Saved for nativePlay.call(this), preserving the audio element receiver.
        const nativePlay = HTMLMediaElement.prototype.play;
        let once = true;
        HTMLMediaElement.prototype.play = function () {
          if (once) {
            once = false;
            return Promise.reject(new DOMException("Transient test failure", "NotAllowedError"));
          }
          return nativePlay.call(this);
        };
      });
      const playable = voices.nth(1);
      await playable.getByRole("button", { name: "Play voice note" }).click();
      await playable.getByText("Couldn't play this voice note.", { exact: false }).waitFor();
      await playable.getByRole("button", { name: "Play voice note" }).click();
      await playable.getByRole("button", { name: "Pause voice note" }).waitFor();
      await expect
        .poll(() =>
          playable
            .locator("audio")
            .evaluate((node) => node instanceof HTMLAudioElement && node.currentTime > 0),
        )
        .toBe(true);
      expect(
        await playable.getByText("Couldn't play this voice note.", { exact: false }).count(),
      ).toBe(0);
      // The other note's error remains owned by that note, not cleared by this recovery.
      expect(await page.getByRole("alert").filter({ hasText: "Couldn't play" }).count()).toBe(1);
      await voices.last().getByRole("button", { name: "Play voice note" }).click();
      await expect
        .poll(() =>
          page
            .locator("audio")
            .evaluateAll(
              (nodes) =>
                nodes.filter((node) => node instanceof HTMLAudioElement && !node.paused).length,
            ),
        )
        .toBe(1);
      expect(await playable.getByRole("button", { name: "Play voice note" }).count()).toBe(1);
      // A fresh mount isolates one failed/recovered attempt and proves absence of both error surfaces.
      await page.reload({ waitUntil: "commit" });
      await page.locator('[role=log][aria-busy="false"]').waitFor();
      await page.evaluate(() => {
        // oxlint-disable-next-line typescript/unbound-method -- Saved for nativePlay.call(this), preserving the audio element receiver.
        const nativePlay = HTMLMediaElement.prototype.play;
        let first = true;
        HTMLMediaElement.prototype.play = function () {
          if (first) {
            first = false;
            return Promise.reject(new DOMException("Transient", "NotAllowedError"));
          }
          return nativePlay.call(this);
        };
      });
      await playable.getByRole("button", { name: "Play voice note" }).click();
      await page.getByRole("alert").filter({ hasText: "Couldn't play" }).waitFor();
      await page.screenshot({ path: "artifacts/j4-fix1/playback-before-retry.png" });
      await playable.getByRole("button", { name: "Play voice note" }).click();
      await playable.getByRole("button", { name: "Pause voice note" }).waitFor();
      expect(await page.getByRole("alert").filter({ hasText: "Couldn't play" }).count()).toBe(0);
      expect(
        await playable.getByText("Couldn't play this voice note.", { exact: false }).count(),
      ).toBe(0);
      await page.screenshot({ path: "artifacts/j4-fix1/playback-after-retry.png" });
      // Hold a new authenticated request across actual sign-out, then release its bytes late.
      const held = Promise.withResolvers<void>();
      let entered = false;
      await page.route("https://quixotic-crab-23.convex.site/files/**", async (route) => {
        entered = true;
        await held.promise;
        await route.continue().catch(() => {});
      });
      await page.getByRole("link", { name: "private-9.txt", exact: false }).click();
      await expect.poll(() => entered).toBe(true);
      await page.getByRole("button", { name: "Account", exact: true }).click();
      await page.getByRole("button", { name: "Sign out", exact: true }).click();
      await page.getByLabel("Email", { exact: true }).waitFor();
      held.resolve();
      await page.unroute("https://quixotic-crab-23.convex.site/files/**");
      await page.evaluate(() => window.dispatchEvent(new Event("q9-resources")));
      expect(await page.locator("html").getAttribute("data-resources")).toContain('"active":0');
      expect(await page.locator("html").getAttribute("data-resources")).toMatch(/"aborted":[1-9]/);
      await page.screenshot({ path: "artifacts/j4-fix1/lifecycle-signed-out.png" });
      process.stdout.write(
        "PASS F1 F3 W10 W11: zero unactivated GETs, requested byte downloads, mounted resource preservation, real playback recovery/exclusion/unplayable download, owned errors, sign-out abort/revocation\n",
      );
    } catch (cause) {
      process.stdout.write(`FAILURE STATE: ${await page.locator("body").innerText()}\n`);
      throw cause;
    } finally {
      await dismissDialogs();
      await account.client.mutation(api.profiles.deleteAccount, {});
      await removeTestUser(email);
    }
  },
);

test("journey 4B: damaged storage preserves healthy Retry entries and denial stays usable", async ({
  app,
}) => {
  await app.open("/");
  const surface = surfaceOf(browserEngine);
  if (!surface) throw new Error("Missing browser");
  const page = surface.page();
  const email = `q9-j4b-store-${crypto.randomUUID()}@example.net`;
  const account = await signInDevAccount(surface.context(), email, "Salma Storage");
  const groupId = await account.client.mutation(api.groups.create, {
    name: "Storage recovery",
    memberIds: [],
    inviteToken: crypto.randomUUID().replaceAll("-", ""),
  });
  const scope = `${account.id}:${groupId}`;
  try {
    await app.open(`/?group=${groupId}`);
    await page.getByRole("textbox", { name: "Message", exact: true }).waitFor();
    await page.evaluate(async (owner) => {
      const request = indexedDB.open("q9chat-media-v1", 1);
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.addEventListener("error", () => reject(request.error), { once: true });
      });
      try {
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction("pending", "readwrite");
          const store = tx.objectStore("pending");
          for (const key of ["a", "c"])
            store.put(
              {
                clientKey: key,
                createdAt: Date.now(),
                files: [{ kind: "file", blob: new Blob([`bytes-${key}`]), name: `${key}.txt` }],
              },
              `${owner}:${key}`,
            );
          store.put({ files: "damaged bytes retained" }, `${owner}:b`);
          tx.oncomplete = () => resolve();
          tx.addEventListener("abort", () => reject(tx.error), { once: true });
        });
      } finally {
        db.close();
      }
    }, scope);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await page.reload();
      await expect
        .poll(() => page.getByRole("button", { name: "Retry", exact: true }).count())
        .toBe(2);
      expect(await page.locator("body").innerText()).toContain("a.txt");
      expect(await page.locator("body").innerText()).toContain("c.txt");
    }
    const retained = await page.evaluate(async (owner) => {
      const request = indexedDB.open("q9chat-media-v1", 1);
      const db = await new Promise<IDBDatabase>((resolve) => {
        request.onsuccess = () => resolve(request.result);
      });
      try {
        const tx = db.transaction("pending", "readonly");
        const store = tx.objectStore("pending");
        const values = await Promise.all(
          [`${owner}:a`, `quarantine:${owner}:b`, `${owner}:c`].map(
            (key) =>
              new Promise<unknown>((resolve) => {
                const read = store.get(key);
                read.onsuccess = () => resolve(read.result);
              }),
          ),
        );
        return values.map((value) => value !== undefined);
      } finally {
        db.close();
      }
    }, scope);
    expect(retained).toEqual([true, true, true]);
    await page.addInitScript(() => {
      indexedDB.open = () => {
        throw new DOMException("Storage denied", "SecurityError");
      };
    });
    await page.reload();
    const field = page.getByRole("textbox", { name: "Message", exact: true });
    await field.fill("Storage denial does not block text");
    expect(await field.inputValue()).toBe("Storage denial does not block text");
    await page.getByRole("alert").filter({ hasText: "Couldn't read unsent attachments" }).waitFor();
  } finally {
    await account.client.mutation(api.profiles.deleteAccount, {});
    await removeTestUser(email);
  }
});
