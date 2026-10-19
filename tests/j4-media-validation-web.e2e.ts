import { readFile } from "node:fs/promises";

import { surfaceOf, test } from "@e2e-dev/web";
import { api } from "@q9chat/convex";
import { expect } from "e2e";

import { browserEngine, devClient, signInDevAccount } from "./support/browser.js";
import { removeTestUser } from "./support/workos.js";

function liveSurface() {
  const surface = surfaceOf(browserEngine);
  if (!surface) throw new Error("Missing live browser");
  return surface;
}

async function validationAccount(label: string) {
  const surface = liveSurface();
  const email = `q9-j4b-${crypto.randomUUID()}@example.net`;
  const account = await signInDevAccount(surface.context(), email, label);
  return { surface, email, account, page: surface.page() };
}

test(
  "journey 4B: genuine image formats and selection recovery",
  { timeout: 180_000 },
  async ({ app }) => {
    await app.open("/");
    const { surface, page, email, account } = await validationAccount("Farah Formats");
    const groupId = await account.client.mutation(api.groups.create, {
      name: "Image format proof",
      memberIds: [],
      inviteToken: crypto.randomUUID().replaceAll("-", ""),
    });
    const posts = async () =>
      (
        await account.client.query(api.messages.range, {
          groupId,
          fromSequence: 1,
          toSequence: 100,
        })
      ).filter((row) => row.kind === "post");
    try {
      await app.open(`/?group=${groupId}`);
      await page.locator('[role=log][aria-busy="false"]').waitFor();
      const field = page.getByRole("textbox", { name: "Message", exact: true });
      await field.fill("Keep the format draft");
      const types = ["png", "jpg", "webp", "gif"];
      const files = await Promise.all(
        types.map(async (extension) => ({
          name: `attachment.${extension}`,
          mimeType: `image/${extension === "jpg" ? "jpeg" : extension}`,
          buffer: await readFile(new URL(`./fixtures/attachment.${extension}`, import.meta.url)),
        })),
      );
      await page.getByLabel("Choose photos", { exact: true }).setInputFiles(files);
      await expect.poll(async () => (await posts()).length).toBe(1);
      const images = (await posts())[0]?.attachments;
      expect(images?.map((file) => file.contentType)).toEqual([
        "image/png",
        "image/jpeg",
        "image/webp",
        "image/gif",
      ]);
      expect(
        images?.every((file) => file.kind === "image" && file.width === 480 && file.height === 240),
      ).toBe(true);
      for (const image of await page.locator("img.photo").all()) {
        await image.scrollIntoViewIfNeeded();
        await expect
          .poll(() =>
            image.evaluate((node) => node instanceof HTMLImageElement && node.naturalWidth),
          )
          .toBe(480);
      }
      const jpeg = files[1];
      if (!jpeg) throw new Error("Missing JPEG fixture");
      await page.getByLabel("Choose files", { exact: true }).setInputFiles(jpeg);
      await expect.poll(async () => (await posts()).length).toBe(2);
      expect((await posts())[1]?.attachments[0]?.kind).toBe("file");
      const photos = page.getByLabel("Choose photos", { exact: true });
      await photos.setInputFiles({
        name: "unsupported.heic",
        mimeType: "image/heic",
        buffer: Buffer.from("not a browser-decodable image"),
      });
      await page.getByRole("alert").filter({ hasText: "Use File" }).waitFor();
      await page.evaluate(() => {
        // oxlint-disable-next-line typescript/unbound-method -- Saved only for restoration, never invoked without its receiver.
        const original = Blob.prototype.arrayBuffer;
        Blob.prototype.arrayBuffer = () =>
          Promise.reject(new DOMException("Unreadable test file", "NotReadableError"));
        window.addEventListener(
          "q9-restore-read",
          () => {
            Blob.prototype.arrayBuffer = original;
          },
          { once: true },
        );
      });
      await page.getByLabel("Choose files", { exact: true }).setInputFiles(jpeg);
      await page.getByRole("alert").filter({ hasText: "Couldn't read that attachment" }).waitFor();
      await page.evaluate(() => window.dispatchEvent(new Event("q9-restore-read")));
      await photos.setInputFiles([]);
      expect((await posts()).length).toBe(2);
      expect(await field.inputValue()).toBe("Keep the format draft");
      process.stdout.write(
        "PASS W03 W05 W06: genuine PNG/JPEG/WebP/GIF decode with integer dimensions, JPEG as File, unsupported and unreadable recovery, empty selection preserves draft\n",
      );
    } finally {
      await devClient(surface.context(), account.client);
      await account.client.mutation(api.profiles.deleteAccount, {});
      await removeTestUser(email);
    }
  },
);

test(
  "journey 4B: recorder start failure leaves a usable composer",
  { timeout: 90_000 },
  async ({ app }) => {
    await app.open("/");
    const { surface, page, email, account } = await validationAccount("Amira Capture");
    const groupId = await account.client.mutation(api.groups.create, {
      name: "Capture recovery",
      memberIds: [],
      inviteToken: crypto.randomUUID().replaceAll("-", ""),
    });
    try {
      await app.open(`/?group=${groupId}`);
      await page.locator('[role=log][aria-busy="false"]').waitFor();
      await page.evaluate(() => {
        navigator.mediaDevices.getUserMedia = async () => {
          const context = new AudioContext();
          const stream = context.createMediaStreamDestination().stream;
          window.addEventListener(
            "q9-check-capture-cleanup",
            () => {
              document.documentElement.dataset["captureReleased"] = String(
                stream.getTracks().every((track) => track.readyState === "ended"),
              );
              void context.close();
            },
            { once: true },
          );
          return stream;
        };
        MediaRecorder.prototype.start = () => {
          throw new DOMException("Test capture start failure", "NotSupportedError");
        };
      });
      await page.getByRole("button", { name: "Record a voice note", exact: true }).click();
      await page.getByRole("alert").filter({ hasText: "Couldn't start recording" }).waitFor();
      // Cross three recorder ticks: setup failure must not leave the timer recreating the recording bar.
      await page.waitForTimeout(350);
      expect(await page.getByText("Recording", { exact: true }).count()).toBe(0);
      await page.evaluate(() => window.dispatchEvent(new Event("q9-check-capture-cleanup")));
      expect(await page.locator("html").getAttribute("data-capture-released")).toBe("true");
      await page.getByRole("textbox", { name: "Message", exact: true }).fill("Still usable");
      process.stdout.write(
        "PASS W09: MediaRecorder.start failure releases capture and leaves the composer usable after timer ticks\n",
      );
    } finally {
      await devClient(surface.context(), account.client);
      await account.client.mutation(api.profiles.deleteAccount, {});
      await removeTestUser(email);
    }
  },
);
