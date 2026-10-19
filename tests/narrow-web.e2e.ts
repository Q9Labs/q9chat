import { mkdir } from "node:fs/promises";

import { test } from "@e2e-dev/web";
import { api } from "@q9chat/convex";
import { expect } from "e2e";

import { liveSurface, signInDevAccount } from "./support/browser.js";
import { webOrigin } from "./support/origin.js";
import { removeTestUser } from "./support/workos.js";

test(
  "narrow web: Groups, conversation, info and browser navigation",
  { timeout: 240_000 },
  async ({ app, browser }) => {
    await app.open("/");
    const surface = liveSurface();
    const page = surface.page();
    // Convex warns on full navigation while a read receipt is still in flight.
    await browser.onDialog("accept");
    await page.emulateMedia({ colorScheme: "light" });
    const email = `q9-narrow-${crypto.randomUUID()}@example.net`;
    const proof = process.env["Q9_NARROW_PROOF"] ?? "artifacts/narrow";
    await mkdir(proof, { recursive: true });
    const account = await signInDevAccount(surface.context(), email, "Hasan Narrow");
    try {
      const groupId = await account.client.mutation(api.groups.create, {
        name: "Q9 Chat launch and the October release for web and phone",
        memberIds: [],
        inviteToken: crypto.randomUUID().replaceAll("-", ""),
      });
      await account.client.mutation(api.messages.send, {
        groupId,
        body: "The narrow web conversation is ready for review.",
        clientKey: crypto.randomUUID(),
        attachments: [],
      });
      await Promise.all(
        Array.from({ length: 16 }, (_, index) =>
          account.client.mutation(api.messages.send, {
            groupId,
            body: `Update ${index + 1}: the team can read earlier messages while checking group details.`,
            clientKey: crypto.randomUUID(),
            attachments: [],
          }),
        ),
      );
      await page.setViewportSize({ width: 390, height: 844 });
      if (process.env["Q9_NARROW_BEFORE"] === "1") {
        await app.open(`/?group=${groupId}`);
        await page.getByRole("log").waitFor();
        await page.screenshot({ path: `${proof}/before-chat.png`, animations: "disabled" });
        return;
      }
      for (const width of [390, 700]) {
        await page.setViewportSize({ width, height: 844 });
        await app.open("/");
        const groups = page.getByRole("complementary", { name: "Groups", exact: true });
        await groups.waitFor();
        await page.locator(".search-box").click();
        await page.getByRole("dialog", { name: "Search messages", exact: true }).waitFor();
        await noOverflow();
        await page.keyboard.press("Escape");
        await page.getByRole("button", { name: "Account", exact: true }).click();
        await page.getByRole("dialog", { name: "Account", exact: true }).waitFor();
        await noOverflow();
        await page.getByRole("button", { name: "Close", exact: true }).click();
        await page.getByRole("button", { name: "New group", exact: true }).click();
        await page.getByRole("dialog", { name: "New group", exact: true }).waitFor();
        await noOverflow();
        await page.getByRole("button", { name: "Cancel", exact: true }).click();
        await noOverflow();
        await page.screenshot({ path: `${proof}/groups-${width}.png`, animations: "disabled" });
        await page.locator(".list .row").click();
        await page.getByRole("log").waitFor();
        await page.getByRole("textbox").fill("A message from the narrow layout");
        await page.getByRole("button", { name: "Send", exact: true }).click();
        await page.getByText("A message from the narrow layout", { exact: true }).first().waitFor();
        await expect
          .poll(async () => {
            const messages = await account.client.query(api.messages.range, {
              groupId,
              fromSequence: 1,
              toSequence: 50,
            });
            return messages.filter(
              (message) =>
                message.kind === "post" && message.body === "A message from the narrow layout",
            ).length;
          })
          .toBe(width === 390 ? 1 : 2);
        await page
          .locator(".msg")
          .first()
          .getByRole("button", { name: "Reply", exact: true })
          .click();
        await page.getByRole("button", { name: "Cancel reply", exact: true }).waitFor();
        await noOverflow();
        await page.screenshot({ path: `${proof}/after-chat-${width}.png`, animations: "disabled" });
        await page.getByRole("button", { name: "Cancel reply", exact: true }).click();
        await page
          .locator(".msg")
          .first()
          .getByRole("button", { name: "More actions", exact: true })
          .click();
        await page.getByRole("menuitem", { name: "Edit", exact: true }).click();
        await page.getByRole("button", { name: "Cancel editing", exact: true }).click();
        await page.getByRole("button", { name: "Attach a photo or file", exact: true }).click();
        await page.keyboard.press("Escape");
        const readingTop = await page.getByRole("log").evaluate((log) => {
          log.scrollTop = 200;
          return log.scrollTop;
        });
        await page.getByRole("button", { name: "Group info", exact: true }).click();
        await page.getByRole("switch", { name: "Mute this group" }).waitFor();
        await page.getByRole("button", { name: /Mentions and replies/ }).click();
        await page.getByText("All messages", { exact: true }).click();
        await page.getByRole("button", { name: /All messages/ }).waitFor();
        await page.getByText("Saving...", { exact: true }).waitFor({ state: "hidden" });
        await noOverflow();
        await page.screenshot({ path: `${proof}/after-info-${width}.png`, animations: "disabled" });
        await page.getByRole("button", { name: /All messages/ }).click();
        await page.getByText("Mentions and replies · Default", { exact: true }).click();
        await page.getByRole("button", { name: /Mentions and replies/ }).waitFor();
        await page.getByText("Saving...", { exact: true }).waitFor({ state: "hidden" });
        await page.getByRole("button", { name: "Close group info", exact: true }).click();
        expect(await page.getByRole("log").evaluate((log) => log.scrollTop)).toBe(readingTop);
        await page.getByRole("link", { name: "Back to Groups" }).click();
        await groups.waitFor();
        await page.locator(".list .row").click();
        await page.getByRole("log").waitFor();
        await page.goBack();
        await groups.waitFor();
        await page.goto(`${webOrigin}/g/${groupId}`, { waitUntil: "commit" });
        await page.getByRole("log").waitFor();
        await page.getByRole("link", { name: "Back to Groups" }).click();
        await groups.waitFor();
      }
      await page.setViewportSize({ width: 390, height: 844 });
      await app.open("/join/not-a-valid-invite");
      await page.getByText("This invite link isn't valid.", { exact: true }).waitFor();
      await noOverflow();
      for (const state of ["chat-failed", "chat-long"]) {
        await app.open(`/gallery?state=${state}&theme=light`);
        await page.locator("#frame").evaluate((frame) => {
          frame.style.width = "100%";
          frame.style.height = "844px";
        });
        await page.getByRole("log").waitFor();
        if (state === "chat-failed")
          await page.getByRole("button", { name: "Retry", exact: true }).scrollIntoViewIfNeeded();
        else await page.locator(".file").first().scrollIntoViewIfNeeded();
        await noOverflow();
        await page.screenshot({ path: `${proof}/${state}.png`, animations: "disabled" });
      }
      await app.open("/gallery?state=chat-recording&theme=light");
      // The gallery intentionally defaults to the desktop mock's fixed frame.
      await page.locator("#frame").evaluate((frame) => {
        frame.style.width = "100%";
        frame.style.height = "844px";
      });
      await page.getByRole("button", { name: "Send voice note", exact: true }).waitFor();
      await noOverflow();
      await page.screenshot({ path: `${proof}/recording.png`, animations: "disabled" });
      await page.setViewportSize({ width: 1280, height: 800 });
      await app.open(`/?group=${groupId}`);
      await page.getByRole("log").waitFor();
      expect(
        await page.locator(".side").evaluate((element) => element.getBoundingClientRect().width),
      ).toBe(288);
      await page.screenshot({ path: `${proof}/desktop.png`, animations: "disabled" });
    } finally {
      await account.client.mutation(api.profiles.deleteAccount, {});
      await removeTestUser(email);
    }

    async function noOverflow() {
      const overflow = await page.evaluate(() =>
        [...document.querySelectorAll(".q9, .side, .main, .info, .dlg, .tl")]
          .filter((element) => element.getClientRects().length > 0)
          .filter((element) => element.scrollWidth > element.clientWidth + 1)
          .map((element) => element.className),
      );
      if (overflow.length > 0) {
        await page.screenshot({ path: `${proof}/overflow.png`, animations: "disabled" });
        process.stdout.write(
          JSON.stringify(
            await page.evaluate(() =>
              [...document.querySelectorAll(".q9 *")]
                .filter((element) => element.getClientRects().length > 0)
                .map((element) => ({
                  name: element.className,
                  left: element.getBoundingClientRect().left,
                  right: element.getBoundingClientRect().right,
                  width: element.clientWidth,
                  scroll: element.scrollWidth,
                }))
                .filter(
                  (element) =>
                    element.right > window.innerWidth ||
                    element.left < 0 ||
                    element.scroll > element.width + 1,
                ),
            ),
          ) + "\n",
        );
      }
      expect(overflow).toEqual([]);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
    }
  },
);
