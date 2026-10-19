import { test } from "@e2e-dev/mobile";
import { expect } from "e2e";

import { openDevClient, shot } from "./android.js";
import { runJ5J6Phone } from "./j5-j6-phone-flow.js";

export function phoneActionsTest(platform: "ios" | "android") {
  void test(
    "J5/J6: reply, act on messages and delete account",
    { timeout: 600_000, platforms: [platform] },
    async ({ app, device, screen }) => {
      if (platform === "ios") await app.restart();
      else {
        await app.clearState();
        await openDevClient(device);
      }
      await expect(screen.getByLabel("Email")).toBeVisible({ timeout: 120_000 });
      await runJ5J6Phone({
        screen,
        enter: (field, value) =>
          platform === "ios" ? field.pressSequentially(value, { delay: 80 }) : field.fill(value),
        submitEmail: () =>
          platform === "ios"
            ? screen.getByLabel("Email").press("Enter")
            : screen.getByRole("button", "Email me a code").tap(),
        shot: async (name) => {
          if (platform === "ios") await app.screenshot(name);
          else shot(name);
        },
      });
    },
  );
}
