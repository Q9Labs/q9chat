import { test } from "@e2e-dev/mobile";
import { expect } from "e2e";

import { runJ4Phone } from "./support/j4-phone-flow.js";

void test(
  "J4: send text, retry, drafts and typing",
  { timeout: 600_000, platforms: ["ios"] },
  async ({ app, device, screen }) => {
    await device.clearKeychain();
    await app.open();
    await expect(screen.getByLabel("Email")).toBeVisible({ timeout: 120_000 });
    await runJ4Phone({
      screen,
      enter: async (field, value) => {
        await field.focus();
        await expect(field).toBeFocused();
        await field.fill("");
        await field.pressSequentially(value, { delay: 80 });
      },
      restart: async () => {
        await app.restart();
      },
      shot: async (name) => {
        await app.screenshot(name);
      },
    });
  },
);
