import { mkdir } from "node:fs/promises";

import { surfaceOf, test } from "@e2e-dev/web";
import { api } from "@q9chat/convex";
import { expect } from "e2e";

import { browserEngine, signInDevAccount } from "./support/browser.js";
import { removeTestUser } from "./support/workos.js";

test(
  "J9: mute, remove a member, clear the removal and leave",
  { timeout: 480_000 },
  async ({ app }) => {
    const { surface, peerContext, thirdContext, page, emails, proof } = await journeyBrowser(app);
    const clients: Awaited<ReturnType<typeof signInDevAccount>>[] = [];
    try {
      await Promise.all(
        [surface.context(), peerContext, thirdContext].map(async (context, index) => {
          const email = emails[index];
          if (!email) throw new Error("Missing fixture email");
          const names = ["Hasan Journey", "Bilal Journey", "Cora Journey"];
          const client = await signInDevAccount(context, email, names[index] ?? "Journey");
          clients[index] = client;
        }),
      );
      const { hasan, bilal, cora } = fixtureMembers(clients);
      const groupId = await hasan.client.mutation(api.groups.create, {
        name: "Operations",
        memberIds: [bilal.id, cora.id],
        inviteToken: crypto.randomUUID().replaceAll("-", ""),
      });
      await bilal.client.mutation(api.messages.send, {
        groupId,
        body: "Private history for current members.",
        clientKey: crypto.randomUUID(),
        attachments: [],
      });
      await app.open(`/?group=${groupId}`);
      await page.getByRole("button", { name: "Group info", exact: true }).click();
      const mute = page.getByRole("switch", { name: "Mute this group" });
      await mute.click();
      if (process.env["Q9_J9_BEFORE"] === "1") {
        await page.getByText("This is coming in the next journey.", { exact: true }).waitFor();
        await page.screenshot({ animations: "disabled", path: `${proof}/before.png` });
        return;
      }
      await expect.poll(() => mute.getAttribute("aria-checked")).toBe("true");
      expect((await hasan.client.query(api.groups.get, { groupId }))?.status).toBe("member");
      await page.screenshot({ animations: "disabled", path: `${proof}/after.png` });
      await mute.click();
      await expect.poll(() => mute.getAttribute("aria-checked")).toBe("false");
      await page.getByRole("button", { name: /Mentions and replies/ }).click();
      await page.getByText("All messages", { exact: true }).click();
      await expect
        .poll(async () => {
          const detail = await hasan.client.query(api.groups.get, { groupId });
          return detail?.status === "member" ? detail.notify : null;
        })
        .toBe("all");
      await mute.click();
      await expect.poll(() => mute.getAttribute("aria-checked")).toBe("true");
      await app.open("/");
      await bilal.client.mutation(api.messages.send, {
        groupId,
        body: "Unread while muted",
        clientKey: crypto.randomUUID(),
        attachments: [],
      });
      await page.locator(".list .row .badge.qt").waitFor();
      await page.screenshot({ animations: "disabled", path: `${proof}/muted-count.png` });
      await page.reload();
      await page.locator(".list .row .badge.qt").waitFor();
      await app.open(`/?group=${groupId}`);
      await page.getByRole("button", { name: "Group info", exact: true }).click();
      const member = page.locator(".mrow").filter({ hasText: "Bilal Journey" });
      await member.hover();
      await member.getByRole("button", { name: "Remove", exact: true }).click();
      await page.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }).click();
      expect((await bilal.client.query(api.groups.get, { groupId }))?.status).toBe("member");
      const peer = await peerContext.newPage();
      await peer.goto(`http://localhost:3000/?group=${groupId}`);
      await peer.getByRole("log").getByText("Private history for current members.").waitFor();
      await member.hover();
      await member.getByRole("button", { name: "Remove", exact: true }).click();
      await page.getByRole("dialog").waitFor();
      await page.screenshot({ animations: "disabled", path: `${proof}/remove-confirm.png` });
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Remove Bilal Journey", exact: true })
        .click();
      await page.getByRole("dialog").waitFor({ state: "hidden" });
      await expect.poll(() => page.getByRole("log").textContent()).toContain("You removed Bilal");
      await peer.getByRole("heading", { name: "You were removed from this group" }).waitFor();
      expect(await peer.getByRole("log").count()).toBe(0);
      expect(await peer.getByRole("textbox").count()).toBe(0);
      await peer.getByRole("button", { name: "Group info for Operations", exact: true }).click();
      await peer.locator(".info-hero").getByText("2 members", { exact: true }).waitFor();
      await peer.screenshot({ animations: "disabled", path: `${proof}/removed.png` });
      await peer.getByRole("button", { name: "Close group info", exact: true }).click();
      await peer.reload();
      await peer.getByRole("button", { name: "Remove from my list" }).waitFor();
      await peer.getByRole("button", { name: "Remove from my list" }).click();
      await peer.locator(".list .row").waitFor({ state: "hidden" });
      expect(await bilal.client.query(api.groups.list, {})).toEqual([]);
      await page.getByRole("button", { name: "Leave group", exact: true }).click();
      await page.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }).click();
      await page.getByRole("button", { name: "Leave group", exact: true }).click();
      await surface.context().setOffline(true);
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Leave group", exact: true })
        .click();
      await page
        .getByRole("alert")
        .filter({ hasText: "You're offline. Reconnect and try again." })
        .waitFor();
      expect((await hasan.client.query(api.groups.get, { groupId }))?.status).toBe("member");
      await surface.context().setOffline(false);
      // New server activity proves the browser's socket has reconnected before retrying.
      await cora.client.mutation(api.messages.send, {
        groupId,
        body: "Reconnected",
        clientKey: crypto.randomUUID(),
        attachments: [],
      });
      await page.getByRole("log").getByText("Reconnected", { exact: true }).waitFor();
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Leave group", exact: true })
        .click();
      await page.getByRole("dialog").waitFor({ state: "hidden" });
      await page.locator(".list .row").waitFor({ state: "hidden" });
      expect(await hasan.client.query(api.groups.list, {})).toEqual([]);
      await app.open(`/?group=${groupId}`);
      expect(await page.getByRole("log").count()).toBe(0);
      await page.getByRole("button", { name: "Account", exact: true }).click();
      await page.getByRole("button", { name: "Sign out", exact: true }).click();
      await page.getByRole("button", { name: "Email me a code", exact: true }).waitFor();
      expect(
        await page.getByText("Private history for current members.", { exact: true }).count(),
      ).toBe(0);
      process.stdout.write(
        "J9 passed: persisted mute/unmute and all modes; grey unread count; removal and hidden history; persistent notice and clear; cancel/offline/retry leave; sign-out.\n",
      );
    } catch (cause) {
      await page.screenshot({
        animations: "disabled",
        path: `${proof}/failure-before-cleanup.png`,
      });
      throw cause;
    } finally {
      await surface.context().setOffline(false);
      const cleanup = await Promise.allSettled(
        clients.map(({ client }) => client.mutation(api.profiles.deleteAccount, {})),
      );
      await peerContext.close();
      await thirdContext.close();
      await Promise.all(emails.map(removeTestUser));
      expect(cleanup.map((result) => result.status)).toEqual(clients.map(() => "fulfilled"));
    }
  },
);

async function journeyBrowser(app: { open: (path: string) => Promise<unknown> }) {
  const surface = surfaceOf(browserEngine);
  if (!surface) throw new Error("Missing browser surface");
  await app.open("/");
  const engine = surface.context().browser();
  if (!engine) throw new Error("Missing browser");
  const peerContext = await engine.newContext();
  const thirdContext = await engine.newContext();
  const page = surface.page();
  const stamp = crypto.randomUUID();
  const emails = ["hasan", "bilal", "cora"].map((name) => `q9-j9-${name}-${stamp}@example.net`);
  const proof = process.env["Q9_J9_PROOF"] ?? "artifacts/j9";
  await mkdir(proof, { recursive: true });
  await page.setViewportSize({ width: 1280, height: 800 });
  return { surface, peerContext, thirdContext, page, emails, proof };
}

function fixtureMembers(clients: readonly Awaited<ReturnType<typeof signInDevAccount>>[]) {
  const [hasan, bilal, cora] = clients;
  if (!hasan || !bilal || !cora) throw new Error("Missing fixture member");
  return { hasan, bilal, cora };
}
