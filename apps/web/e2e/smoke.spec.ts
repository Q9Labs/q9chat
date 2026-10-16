import { expect, test } from "@playwright/test";

test("signed-out visitors see the sign-in button", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Q9 Chat" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
});
