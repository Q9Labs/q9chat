import { surfaceOf, test } from "@e2e-dev/web";
import { api } from "@q9chat/convex";
import { expect } from "e2e";

import { browserEngine, signInDevAccount } from "./support/browser.js";
import { removeTestUser } from "./support/workos.js";

test(
  "J7: search your groups and open an old message",
  { timeout: 300_000 },
  async ({ app, browser }) => {
    const surface = surfaceOf(browserEngine);
    if (!surface) throw new Error("Missing live browser");
    await app.open("/");
    const page = surface.page();
    const email = `q9-j7-${Date.now()}@example.net`;
    const account = await signInDevAccount(surface.context(), email, "Search Journey");
    try {
      await browser.setViewport({ width: 1280, height: 800 });
      await browser.emulateMedia({ colorScheme: "light" });
      const groupId = await account.client.mutation(api.groups.create, {
        name: "Launch search",
        memberIds: [],
        inviteToken: crypto.randomUUID().replaceAll("-", ""),
      });
      const archive = await account.client.mutation(api.groups.create, {
        name: "Archive search",
        memberIds: [],
        inviteToken: crypto.randomUUID().replaceAll("-", ""),
      });
      await account.client.mutation(api.messages.send, {
        groupId: archive,
        body: "An earlier checklist in another group.",
        clientKey: crypto.randomUUID(),
        attachments: [],
      });
      const target = await account.client.mutation(api.messages.send, {
        groupId,
        body: "The launch checklist is ready for review.",
        clientKey: crypto.randomUUID(),
        attachments: [],
      });
      // Put the match outside the latest three history pages.
      for (let index = 0; index < 305; index += 5)
        await Promise.all(
          Array.from({ length: 5 }, (_, offset) =>
            account.client.mutation(
              api.messages.send,
              {
                groupId,
                body: `Later conversation ${index + offset}`,
                clientKey: crypto.randomUUID(),
                attachments: [],
              },
              { skipQueue: true },
            ),
          ),
        );
      await app.open(`/?group=${groupId}`);
      await page.locator('[role=log][aria-busy="false"]').waitFor();
      await page.getByRole("button", { name: "Search ⌘K", exact: true }).click();
      const field = page.getByRole("textbox", { name: "Search messages", exact: true });
      await field.waitFor();
      await field.fill("quartz");
      await expect(browser.locator(".search-empty")).toHaveText("No messages match “quartz”.");
      await page.screenshot({ path: "artifacts/j7-empty.png" });
      await field.fill("checklist");
      await expect(browser.locator(".res .ri")).toHaveCount(2);
      await expect(browser.locator(".res .ri").first()).toContainText("Launch search");
      await expect(browser.locator(".res .ri").last()).toContainText("Archive search");
      await page.screenshot({ path: "artifacts/j7-search.png" });
      await browser.setViewport({ width: 390, height: 844 });
      await page.screenshot({ path: "artifacts/j7-narrow.png" });
      await browser.setViewport({ width: 1280, height: 800 });
      await browser.emulateMedia({ colorScheme: "dark" });
      await page.screenshot({ path: "artifacts/j7-dark.png" });
      await browser.emulateMedia({ colorScheme: "light" });
      await field.press("Enter");
      await page.locator(`#m-${target.messageId}`).waitFor();
      await expect(browser.locator(`#m-${target.messageId}`)).toContainText(
        "The launch checklist is ready for review.",
      );
      expect(await page.locator(`#m-${target.messageId}`).getAttribute("class")).toContain("flash");
      expect(
        await page.locator(`#m-${target.messageId}`).evaluate((node) => {
          const bounds = node.getBoundingClientRect();
          const log = document.querySelector("[role=log]")?.getBoundingClientRect();
          return Boolean(log && bounds.top >= log.top && bounds.bottom <= log.bottom);
        }),
      ).toBe(true);
      await page.screenshot({ path: "artifacts/j7-target.png" });
      await page.getByRole("button", { name: "Jump to latest", exact: true }).click();
      await expect(browser.locator("[role=log]")).toContainText("Later conversation 304");
      await page.getByRole("button", { name: "Search in this group", exact: true }).click();
      await field.waitFor();
      await expect(browser.locator(".scope-chip")).toContainText("In Launch search");
      await field.fill("checklist");
      await expect(browser.locator(".res .ri")).toHaveCount(1);
      await page.getByRole("button", { name: "Search all groups", exact: true }).click();
      await expect(browser.locator(".scope-chip")).toHaveCount(0);
      await expect(browser.locator(".res .ri")).toHaveCount(2);
      await field.press("Escape");
      await page.keyboard.press("Meta+k");
      await field.waitFor();
      await field.fill("checklist");
      await expect(browser.locator(".res .ri")).toHaveCount(2);
      // Membership changes must revoke already-displayed action results, too.
      await account.client.mutation(api.groups.leave, { groupId });
      await expect(browser.locator(".res .ri")).toHaveCount(1);
      await expect(browser.locator(".res .ri")).toContainText("Archive search");
      await field.press("Escape");
      await page.context().setOffline(true);
      await page.keyboard.press("Meta+k");
      await field.waitFor();
      await expect(browser.locator(".search-empty")).toContainText("You're offline.");
      await page.context().setOffline(false);
      await field.press("Escape");
      await page.getByRole("button", { name: "Account", exact: true }).click();
      await page.getByRole("button", { name: "Sign out", exact: true }).click();
      await expect(browser.locator(".search-box")).toHaveCount(0);
      await page.getByRole("button", { name: "Email me a code", exact: true }).waitFor();
    } finally {
      await page.context().setOffline(false);
      await account.client.mutation(api.profiles.deleteAccount, {});
      await removeTestUser(email);
    }
  },
);
