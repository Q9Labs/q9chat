import { randomUUID } from "node:crypto";

import { api, type Id } from "@q9chat/convex";
import { expect, type Locator, type Screen } from "e2e";

import { createPhoneAccount, enterPhoneEmailCode } from "./phone-fixtures.js";
import { deletePhoneProfile, removeTestUser, type PhoneSession } from "./workos.js";

/** One real phone journey: search across groups, then manage membership from both sides. */
export async function runPhoneGroups(p: {
  screen: Screen;
  enter: (field: Locator, value: string) => Promise<void>;
  shot: (name: string) => Promise<void> | void;
}) {
  const stamp = randomUUID().replaceAll("-", "").slice(0, 12);
  const readerEmail = `q9-pg-reader-${stamp}@example.net`;
  const peerEmail = `q9-pg-peer-${stamp}@example.net`;
  const sessions: PhoneSession[] = [];
  const { screen } = p;
  async function login(email: string) {
    await enterPhoneEmailCode(
      {
        ...p,
        enterCode: (code) =>
          screen.getByLabel("6-digit code").pressSequentially(code, { delay: 80 }),
      },
      email,
    );
    await expect(screen.getByRole("button", "Account", { exact: true })).toBeVisible({
      timeout: 30_000,
    });
  }
  async function logout() {
    await screen.getByRole("button", "Account", { exact: true }).tap();
    await screen.getByRole("button", "Sign out", { exact: true }).tap();
    await expect(screen.getByLabel("Email")).toBeVisible();
  }
  try {
    const reader = await createPhoneAccount(readerEmail, "Nadia Reader", sessions);
    const peer = await createPhoneAccount(peerEmail, "Bilal Writer", sessions);
    const title = `Search team ${stamp}`;
    const leaveTitle = `Leave team ${stamp}`;
    const group = await peer.client.mutation(api.groups.create, {
      name: title,
      memberIds: [reader.id],
      inviteToken: randomUUID().replaceAll("-", ""),
    });
    const leaveGroup = await peer.client.mutation(api.groups.create, {
      name: leaveTitle,
      memberIds: [reader.id],
      inviteToken: randomUUID().replaceAll("-", ""),
    });
    async function send(groupId: Id<"groups">, body: string) {
      return peer.client.mutation(api.messages.send, {
        groupId,
        body,
        clientKey: randomUUID(),
        attachments: [],
      });
    }
    const target = await send(group, "Lighthouse launch decision");
    // Beyond the newest three-page history window: a hit must request the old range.
    // Preserve chronology without flooding one group with conflicting concurrent mutations.
    // eslint-disable-next-line no-await-in-loop
    for (let i = 0; i < 305; i++) await send(group, `Backlog ${i}`);
    await send(leaveGroup, "Lighthouse second team");
    await login(readerEmail);
    await screen.getByLabel("Search", { exact: true }).tap();
    await expect(screen.getByText("Search messages in all your groups.")).toBeVisible();
    await p.enter(screen.getByLabel("Search messages"), "zzznomatch");
    await expect(screen.getByText("No messages match “zzznomatch”.")).toBeVisible();
    await p.enter(screen.getByLabel("Search messages"), "Lighthouse");
    const hit = screen.getByRole("button", `${title}, Bilal: Lighthouse launch decision`);
    await expect(hit).toBeVisible();
    await expect(
      screen.getByRole("button", `${leaveTitle}, Bilal: Lighthouse second team`),
    ).toBeVisible();
    await p.shot("phone-groups-search");
    await fetch("http://localhost:8321/__fault", { method: "POST" });
    await expect(screen.getByText("You're offline. Reconnect to search messages.")).toBeVisible();
    await expect(hit).not.toBeVisible();
    await fetch("http://localhost:8321/__fault", { method: "DELETE" });
    await expect(hit).toBeVisible({ timeout: 30_000 });
    await hit.tap();
    await expect(screen.getByLabel("Bilal: Lighthouse launch decision")).toBeVisible();
    await expect
      .poll(async () => {
        const row = await screen.getByLabel("Bilal: Lighthouse launch decision").boundingBox();
        const history = await screen.getByLabel("Messages", { exact: true }).boundingBox();
        return (
          row !== null &&
          history !== null &&
          row.y >= history.y &&
          row.y + row.height <= history.y + history.height
        );
      })
      .toBe(true);
    await p.shot("phone-groups-target");
    await screen.getByRole("button", "Jump to latest").tap();
    await expect(screen.getByLabel("Bilal: Backlog 304")).toBeVisible();
    // Selecting the identical hit again must be a new jump, not a stale route.
    await screen.getByRole("button", "Search in this group").tap();
    await p.enter(screen.getByLabel("Search messages"), "Lighthouse");
    await hit.tap();
    await expect(screen.getByLabel("Bilal: Lighthouse launch decision")).toBeVisible();
    await screen.getByRole("button", `Group info for ${title}`).tap();
    await p.shot("phone-groups-info");
    await screen.getByRole("switch", "Mute this group").tap();
    await expect
      .poll(async () => {
        const detail = await reader.client.query(api.groups.get, { groupId: group });
        return detail?.status === "member" ? detail.notify : null;
      })
      .toBe("muted");
    await p.shot("phone-groups-muted");
    await send(group, "Muted unread count");
    await screen.getByRole("button", "Back", { exact: true }).tap();
    await screen.getByRole("button", "Back to groups").tap();
    await expect(screen.getByRole("button", new RegExp(`${title}.*muted$`))).toBeVisible();
    await p.shot("phone-groups-muted-count");
    await screen.getByRole("button", new RegExp(`${title}.*muted$`)).tap();
    await screen.getByRole("button", `Group info for ${title}, muted`).tap();
    await screen.getByRole("switch", "Mute this group").tap();
    await expect
      .poll(async () => {
        const detail = await reader.client.query(api.groups.get, { groupId: group });
        return detail?.status === "member" ? detail.notify : null;
      })
      .toBe("mentions");
    await screen.getByRole("button", "Options for Bilal Writer").tap();
    await p.shot("phone-groups-member-options");
    await screen.getByRole("button", "Remove from group").tap();
    await expect(screen.getByText("Remove Bilal?")).toBeVisible();
    await p.shot("phone-groups-remove-confirm");
    await screen.getByRole("button", "Remove Bilal", { exact: true }).tap();
    await expect(screen.getByText("Removed Bilal")).toBeVisible();
    await expect
      .poll(async () => (await peer.client.query(api.groups.get, { groupId: group }))?.status)
      .toBe("removed");
    await screen.getByRole("button", "Back", { exact: true }).tap();
    await screen.getByRole("button", "Back to groups").tap();
    await logout();
    await login(peerEmail);
    const removedRow = screen.getByRole("button", `${title}, Nadia removed you`);
    await expect(removedRow).toBeVisible();
    await removedRow.tap();
    await expect(screen.getByText("You were removed from this group")).toBeVisible();
    await expect(screen.getByLabel("Bilal: Lighthouse launch decision")).not.toBeVisible();
    await p.shot("phone-groups-removed-view");
    await screen.getByRole("button", "Remove from my list").tap();
    await expect(removedRow).not.toBeVisible();
    await screen.getByLabel("Search", { exact: true }).tap();
    await p.enter(screen.getByLabel("Search messages"), "Lighthouse");
    await expect(screen.getByText("1 message")).toBeVisible();
    await expect(
      screen.getByRole("button", `${title}, Bilal: Lighthouse launch decision`),
    ).not.toBeVisible();
    await screen.getByRole("button", "Cancel", { exact: true }).tap();
    await logout();
    await login(readerEmail);
    await screen.getByRole("button", new RegExp(leaveTitle)).tap();
    await screen.getByRole("button", `Group info for ${leaveTitle}`).tap();
    await screen.getByRole("button", "Leave group", { exact: true }).tap();
    await expect(screen.getByText(`Leave ${leaveTitle}?`)).toBeVisible();
    await p.shot("phone-groups-leave-confirm");
    await screen.getByRole("button", "Leave group", { exact: true }).tap();
    await expect(screen.getByRole("button", "Account", { exact: true })).toBeVisible();
    await expect(screen.getByRole("button", new RegExp(leaveTitle))).not.toBeVisible();
    if ((await reader.client.query(api.groups.get, { groupId: leaveGroup })) !== null)
      throw new Error("Left group still exposes history");
    await screen.getByLabel("Search", { exact: true }).tap();
    await p.enter(screen.getByLabel("Search messages"), "Lighthouse");
    await expect(screen.getByText("1 message")).toBeVisible();
    await expect(screen.getByRole("button", new RegExp(leaveTitle))).not.toBeVisible();
    await screen.getByRole("button", "Cancel", { exact: true }).tap();
    await logout();
    if (target.sequence < 1) throw new Error("Missing search target");
  } finally {
    await fetch("http://localhost:8321/__fault", { method: "DELETE" });
    await Promise.all(sessions.map(deletePhoneProfile));
    await Promise.all([readerEmail, peerEmail].map(removeTestUser));
  }
}
