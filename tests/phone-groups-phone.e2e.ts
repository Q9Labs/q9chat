import { test } from "@e2e-dev/mobile";
import { expect } from "e2e";

import { runPhoneGroups } from "./support/phone-groups-flow.js";

void test(
  "Phone groups: search, mute, leave and remove",
  { timeout: 900_000, platforms: ["ios"] },
  async ({ app, screen }) => {
    await app.restart();
    const email = screen.getByLabel("Email");
    const signOut = screen.getByRole("button", "Sign out", { exact: true });
    const account = screen.getByRole("button", "Account", { exact: true });
    await expect
      .poll(
        async () =>
          (await email.isVisible()) || (await signOut.isVisible()) || (await account.isVisible()),
      )
      .toBe(true);
    if (await account.isVisible()) await account.tap();
    if (await signOut.isVisible()) await signOut.tap();
    await expect(screen.getByLabel("Email")).toBeVisible({ timeout: 120_000 });
    await runPhoneGroups({
      screen,
      restart: () => app.restart(),
      enter: (field, value) => field.pressSequentially(value, { delay: 80 }),
      shot: async (name) => {
        await app.screenshot(name);
      },
    });
  },
);
