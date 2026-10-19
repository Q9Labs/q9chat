import { test } from "@e2e-dev/mobile";
import { expect } from "e2e";

import { openDevClient, shot } from "./support/android.js";
import { runJ4Phone } from "./support/j4-phone-flow.js";

void test(
  "J4: send text, retry, drafts and typing",
  { timeout: 600_000, platforms: ["android"] },
  async ({ app, device, screen }) => {
    await app.clearState();
    await openDevClient(device);
    await expect(screen.getByLabel("Email")).toBeVisible({ timeout: 120_000 });
    await runJ4Phone({
      screen,
      enter: (field, value) => field.fill(value),
      restart: async () => {
        await openDevClient(device);
      },
      shot,
    });
  },
);
