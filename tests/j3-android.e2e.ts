import { test } from "@e2e-dev/mobile";
import { expect } from "e2e";

import { openDevClient, shot } from "./support/android.js";
import { runJ3 } from "./support/j3-flow.js";

void test(
  "J3: open unread history and read live",
  { timeout: 600_000, platforms: ["android"] },
  async ({ app, device, screen }) => {
    await app.clearState();
    await openDevClient(device);
    await expect(screen.getByLabel("Email")).toBeVisible({ timeout: 120_000 });
    await runJ3({
      screen,
      enter: (field, value) => field.fill(value),
      shot: (name) => {
        shot(name);
      },
    });
  },
);
