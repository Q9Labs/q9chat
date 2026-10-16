import { expect, test } from "@playwright/test";

test("home page exposes the starter heading and primary action", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "q9chat" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Explore the starter" })).toBeVisible();
});
