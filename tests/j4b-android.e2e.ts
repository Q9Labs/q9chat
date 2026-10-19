import { test } from "@e2e-dev/mobile";
import { expect } from "e2e";

import { adb, openDevClient, shot } from "./support/android.js";
import { runJ4bPhone } from "./support/j4b-phone-flow.js";
import { phoneMediaFiles } from "./support/phone-media.js";
import { phoneOutboxSnapshot, stopPhone } from "./support/phone-outbox.js";

void test(
  "J4b: send photo, file and voice with retry",
  { timeout: 600_000, platforms: ["android"] },
  async ({ app, device, screen }) => {
    await app.clearState();
    adb("shell", "pm", "grant", "ai.q9labs.chat", "android.permission.RECORD_AUDIO");
    await openDevClient(device);
    await expect(screen.getByLabel("Email")).toBeVisible({ timeout: 120_000 });
    await runJ4bPhone({
      screen,
      stop: () => stopPhone("android"),
      restart: async () => {
        await openDevClient(device);
      },
      outbox: (profile, group) => phoneOutboxSnapshot("android", profile, group),
      cachedMedia: (profile, group) => phoneMediaFiles("android", profile, group),
      voice: "record",
      enter: (field, value) => field.fill(value),
      shot,
      openFile: async () => {
        await expect(screen.getByText("Sharing 1 file", { exact: true })).toBeVisible();
        shot("j4b-file-open");
        await device.back();
      },
      pickPhoto: async () => {
        await screen
          .getByRole("group", /^Photo taken on /)
          .first()
          .tap();
      },
      pickFile: async () => {
        await screen.getByRole("button", "Show roots", { exact: true }).tap();
        await screen
          .getByTestId("android:id/title")
          .filter({ hasText: /^Downloads$/u })
          .tap();
        await screen.getByText("q9-attachment.txt", { exact: true }).tap();
      },
    });
  },
);
