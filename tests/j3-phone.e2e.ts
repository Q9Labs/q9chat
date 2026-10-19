import { test } from "@e2e-dev/mobile";
import { expect } from "e2e";

import { runJ3 } from "./support/j3-flow.js";

void test(
  "J3: open unread history and read live",
  { timeout: 600_000, platforms: ["ios"] },
  async ({ app, device, screen }) => {
    await device.clearKeychain();
    await app.open();
    const email = screen.getByRole("textbox", "Email");
    await expect(email).toBeVisible({ timeout: 120_000 });
    await email.focus();
    await expect(email).toBeFocused();
    await runJ3({
      screen,
      enter: async (field, value) => {
        await field.focus();
        await expect(field).toBeFocused();
        await field.pressSequentially(value, { delay: 80 });
      },
      shot: async (name) => {
        await app.screenshot(name);
      },
    });
  },
);
