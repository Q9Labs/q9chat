import { test } from "@e2e-dev/mobile";
import { expect } from "e2e";

import { adbShell, openDevClient, screenDensity, shot } from "./support/android.js";
import { runJ2 } from "./support/j2-flow.js";

// Journey 2 on the phone, Android emulator edition: the same flow as j2-phone.e2e.ts, plus the system Back key
// closing a sheet before it leaves the screen. Runs against dev Convex and the web Worker on
// http://localhost:3000 (reached through `adb reverse`), on the emulator named by J1_ANDROID_SERIAL.

test(
  "J2: create, add and join by link",
  { timeout: 900_000, platforms: ["android"] },
  async ({ app, device, screen }) => {
    await app.clearState();
    await openDevClient(device);
    await expect(screen.getByRole("button", "Continue with Google")).toBeVisible({
      timeout: 360_000,
    });
    await runJ2({
      screen,
      target: Math.floor(44 * screenDensity()) - 1,
      // The emulator's screen capture can still show the screen that a navigation just left.
      shot: async (name) => {
        await new Promise((resolve) => setTimeout(resolve, 800));
        shot(name);
      },
      enter: (field, text) => field.fill(text),
      enterCode: (digits) => screen.getByLabel("6-digit code").pressSequentially(digits),
      restart: () => openDevClient(device),
      openLink: (url) => {
        // The emulator opens the app from a link without asking.
        adbShell(`am start -a android.intent.action.VIEW -d '${url}' ai.q9labs.chat`);
        return Promise.resolve();
      },
      systemBack: () => device.back(),
    });
  },
);
