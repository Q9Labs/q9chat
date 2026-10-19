import { test } from "@e2e-dev/mobile";
import { expect } from "e2e";

import { runPhoneGroups } from "./support/phone-groups-flow.js";

void test(
  "Phone groups: search, mute, leave and remove",
  { timeout: 900_000, platforms: ["ios"] },
  async ({ app, device, screen }) => {
    await device.clearKeychain();
    await app.open();
    await expect(screen.getByLabel("Email")).toBeVisible({ timeout: 120_000 });
    await runPhoneGroups({
      screen,
      enter: async (field, value) => {
        await field.focus();
        await field.fill(value);
      },
      shot: async (name) => {
        await app.screenshot(name);
      },
    });
  },
);
