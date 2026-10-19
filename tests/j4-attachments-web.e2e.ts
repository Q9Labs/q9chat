import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import { test } from "@e2e-dev/web";
import { api } from "@q9chat/convex";
import { expect } from "e2e";

import { liveSurface, devClient, signInDevAccount } from "./support/browser.js";
import { webOrigin } from "./support/origin.js";
import { sendWire } from "./support/send-wire.js";
import { removeTestUser } from "./support/workos.js";

const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

test(
  "journey 4B: real attachment bytes, durable retries and capture",
  { timeout: 360_000 },
  async ({ app, browser }) => {
    const surface = liveSurface();
    await app.open("/");
    const page = surface.page();
    const engine = surface.context().browser();
    if (!engine) throw new Error("Missing browser engine");
    const peer = await engine.newContext();
    const stamp = `${Date.now()}-${crypto.randomUUID().slice(0, 6)}`;
    const emailA = `q9-j4b-a-${stamp}@example.net`;
    const emailB = `q9-j4b-b-${stamp}@example.net`;
    const a = await signInDevAccount(surface.context(), emailA, "Amira Attachments");
    const b = await signInDevAccount(peer, emailB, "Bilal Attachments");
    const wire = await sendWire(page);
    const groupId = await a.client.mutation(api.groups.create, {
      name: "Attachment conversation",
      memberIds: [b.id],
      inviteToken: crypto.randomUUID().replaceAll("-", ""),
    });
    async function posts() {
      return (
        await a.client.query(api.messages.range, { groupId, fromSequence: 1, toSequence: 100 })
      ).filter((row) => row.kind === "post");
    }
    async function count(total: number) {
      await expect.poll(async () => (await posts()).length).toBe(total);
    }
    const shot = (name: string) =>
      page.screenshot({ path: `artifacts/j4-attachments/${name}.png` });
    async function reload() {
      const off = await browser.onDialog("accept");
      try {
        await page.reload({ waitUntil: "commit" });
      } finally {
        await off();
      }
      await page.getByRole("textbox", { name: "Message", exact: true }).waitFor();
    }
    try {
      await app.open(`/?group=${groupId}`);
      const field = page.getByRole("textbox", { name: "Message", exact: true });
      await page.locator('[role=log][aria-busy="false"]').waitFor();
      await shot("before-light-wide");
      await field.fill("Keep this text draft");
      await page.getByRole("button", { name: "Attach a photo or file", exact: true }).click();
      await shot("menu-light-wide");
      await page.keyboard.press("Escape");
      expect(await field.inputValue()).toBe("Keep this text draft");
      const image = await readFile(new URL("./fixtures/attachment.png", import.meta.url));
      async function verifyImage() {
        await page
          .getByLabel("Choose photos", { exact: true })
          .setInputFiles({ name: "photo.png", mimeType: "image/png", buffer: image });
        await count(1);
        await page.locator(".mst").waitFor({ state: "detached" });
        expect(await field.inputValue()).toBe("Keep this text draft");
        const imagePost = (await posts())[0];
        if (!imagePost) throw new Error("No image post");
        const imageAttachment = imagePost.attachments[0];
        expect(imageAttachment?.kind).toBe("image");
        if (imageAttachment?.kind !== "image") throw new Error("Wrong image kind");
        expect([imageAttachment.width, imageAttachment.height]).toEqual([480, 240]);
        const peerPage = await peer.newPage();
        await peerPage.goto(`${webOrigin}/?group=${groupId}`);
        const peerImage = peerPage.locator("img.photo");
        await expect
          .poll(() =>
            peerImage.evaluate((img) => img instanceof HTMLImageElement && img.naturalWidth),
          )
          .toBe(480);
        const peerImageBytes = await peerImage.evaluate(async (img) => [
          ...new Uint8Array(await (await fetch(img.getAttribute("src") ?? "")).arrayBuffer()),
        ]);
        expect(digest(new Uint8Array(peerImageBytes))).toBe(digest(image));
        await reload();
        await expect
          .poll(() =>
            page
              .locator("img.photo")
              .evaluate((img) => img instanceof HTMLImageElement && img.naturalHeight),
          )
          .toBe(240);
        process.stdout.write(
          "PASS W01 W11 W18: real image bytes and dimensions reach another member and reload; draft survives",
        );

        return peerPage;
      }
      const peerPage = await verifyImage();

      const filename = `عرض-👩🏽-é-${"long-".repeat(24)}.pdf`;
      const document = Buffer.from("%PDF-1.7\nQ9 attachment byte proof\n%%EOF\n");
      async function verifyFile() {
        await page
          .getByLabel("Choose files", { exact: true })
          .setInputFiles({ name: filename, mimeType: "application/pdf", buffer: document });
        await count(2);
        const downloadEvent = peerPage.waitForEvent("download");
        await peerPage.getByRole("link", { name: new RegExp("عرض-") }).click();
        const download = await downloadEvent;
        expect(download.suggestedFilename()).toBe(filename);
        const path = await download.path();
        if (!path) throw new Error("No download path");
        expect(digest(await readFile(path))).toBe(digest(document));
        process.stdout.write(
          "PASS W02 W22: long Unicode filename and downloaded SHA-256 match original bytes",
        );
      }
      await verifyFile();

      // W03: File deliberately accepts sniffed image, HEIC and audio containers as files.
      const heic = Buffer.from([
        0, 0, 0, 24, 102, 116, 121, 112, 104, 101, 105, 99, 0, 0, 0, 0, 104, 101, 105, 99, 109, 105,
        102, 49,
      ]);
      const audio = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3, 4]);
      await page.getByLabel("Choose files", { exact: true }).setInputFiles([
        { name: "same.png", mimeType: "image/png", buffer: image },
        { name: "same.heic", mimeType: "image/heic", buffer: heic },
        { name: "same.webm", mimeType: "audio/webm", buffer: audio },
      ]);
      await count(3);
      expect((await posts())[2]?.attachments.map((item) => item.kind)).toEqual([
        "file",
        "file",
        "file",
      ]);
      process.stdout.write("PASS W03: File sends image, HEIC and audio containers as files");

      const files = page.getByLabel("Choose files", { exact: true });
      const photos = page.getByLabel("Choose photos", { exact: true });
      await files.setInputFiles({
        name: "empty.txt",
        mimeType: "text/plain",
        buffer: Buffer.alloc(0),
      });
      await page.getByRole("alert").filter({ hasText: "empty" }).waitFor();
      await files.setInputFiles({
        name: "large.bin",
        mimeType: "application/octet-stream",
        buffer: Buffer.alloc(20_000_001),
      });
      await page.getByRole("alert").filter({ hasText: "over 20 MB" }).waitFor();
      await photos.setInputFiles({ name: "renamed.png", mimeType: "image/png", buffer: document });
      await page.getByRole("alert").filter({ hasText: "Choose a JPEG" }).waitFor();
      await photos.setInputFiles({
        name: "corrupt.png",
        mimeType: "image/png",
        buffer: Buffer.from([137, 80, 78, 71, 0, 0, 0, 0]),
      });
      await page.getByRole("alert").filter({ hasText: "Couldn't open" }).waitFor();
      expect((await posts()).length).toBe(3);
      process.stdout.write(
        "PASS W04 W05 W06: empty/oversize, renamed and corrupt selections fail recoverably before send",
      );

      let rejectUpload = true;
      await page.route("**/upload", async (route) => {
        if (rejectUpload)
          await route.fulfill({
            status: 413,
            headers: { "Access-Control-Allow-Origin": webOrigin },
          });
        else await route.continue();
      });
      await files.setInputFiles({
        name: "retry.pdf",
        mimeType: "application/pdf",
        buffer: document,
      });
      await page.getByRole("button", { name: "Retry", exact: true }).waitFor();
      await shot("failed-light-wide");
      await reload();
      await page.getByRole("button", { name: "Retry", exact: true }).waitFor();
      rejectUpload = false;
      wire.set("fail-committed");
      await page.getByRole("button", { name: "Retry", exact: true }).click();

      await count(4);
      await shot("sending-light-wide");
      wire.release();
      await reload();
      // The live row reconciles persisted bytes without a duplicate after the lost response.
      await page.locator(".mst").waitFor({ state: "detached" });
      expect((await posts()).length).toBe(4);
      wire.set("normal");
      process.stdout.write(
        "PASS W12 W13 W15: HTTP 413 retry survives reload; committed lost response reconciles once",
      );

      async function verifyVoice() {
        // Known oscillator input is injected audio, not a physical-microphone or audible-device claim.
        await page.evaluate(() => {
          navigator.mediaDevices.getUserMedia = async () => {
            const context = new AudioContext();
            const oscillator = context.createOscillator();
            oscillator.frequency.value = 440;
            const destination = context.createMediaStreamDestination();
            oscillator.connect(destination);
            oscillator.start();
            for (const track of destination.stream.getTracks())
              track.addEventListener("ended", () => {
                oscillator.stop();
                void context.close();
              });
            return destination.stream;
          };
        });
        await page.getByRole("button", { name: "Record a voice note", exact: true }).click();
        await page.getByText("Recording", { exact: true }).waitFor();
        await expect.poll(() => page.locator(".recording-bar .dur").textContent()).not.toBe("0:00");
        await shot("recording-light-wide");
        await page.getByRole("button", { name: "Send voice note", exact: true }).click();
        await count(5);
        const voicePost = (await posts())[4];
        const voice = voicePost?.attachments[0];
        if (!voice || voice.kind !== "voice") throw new Error("No captured voice note");
        expect(voicePost.body).toBe("");
        expect(voice.durationMs > 0 && voice.durationMs <= 600_000).toBe(true);
        expect(
          voice.waveform.length <= 64 && voice.waveform.every((peak) => peak >= 0 && peak <= 1),
        ).toBe(true);
        await page.getByRole("button", { name: "Play voice note", exact: true }).click();
        await page.getByRole("button", { name: "Pause voice note", exact: true }).waitFor();
        await expect
          .poll(() =>
            page
              .locator("audio")
              .evaluate(
                (element) => element instanceof HTMLAudioElement && element.currentTime > 0,
              ),
          )
          .toBe(true);
        await page.getByRole("button", { name: "Play voice note", exact: true }).waitFor();
        expect(await field.inputValue()).toBe("Keep this text draft");
        process.stdout.write(
          `PASS W07 W08 W10: actual MediaRecorder ${voice.contentType}, ${voice.durationMs}ms; real audio element plays to completion`,
        );
      }
      await verifyVoice();
      await shot("messages-light-wide");
      await page.emulateMedia({ colorScheme: "dark" });
      await shot("messages-dark-wide");
      await page.setViewportSize({ width: 390, height: 844 });
      await shot("messages-dark-narrow");
      await page.emulateMedia({ colorScheme: "light" });
      await shot("messages-light-narrow");
      await page.getByRole("button", { name: "Record a voice note", exact: true }).click();
      await page.getByText("Recording", { exact: true }).waitFor();
      await shot("recording-light-narrow");
      await page.getByRole("button", { name: "Cancel", exact: true }).click();
      expect((await posts()).length).toBe(5);
      process.stdout.write(
        "PASS W07 W18 W24: cancel sends nothing, draft retained, light/dark wide/narrow receipts captured",
      );
    } catch (cause) {
      await shot("failure-context");
      process.stderr.write(
        JSON.stringify(
          await page.evaluate(() => ({
            alerts: [...document.querySelectorAll('[role="alert"]')].map(
              (node) => node.textContent,
            ),
            statuses: [...document.querySelectorAll(".mst")].map((node) => node.textContent),
            images: document.querySelectorAll("img.photo").length,
          })),
        ) + "\n",
      );
      process.stderr.write(`Observed send calls: ${wire.sends.length}\n`);
      throw cause;
    } finally {
      wire.set("normal");
      await Promise.allSettled([
        devClient(surface.context(), a.client).then((client) =>
          client.mutation(api.profiles.deleteAccount, {}),
        ),
        devClient(peer, b.client).then((client) => client.mutation(api.profiles.deleteAccount, {})),
      ]);
      await peer.close();
      await Promise.all([removeTestUser(emailA), removeTestUser(emailB)]);
    }
  },
);
