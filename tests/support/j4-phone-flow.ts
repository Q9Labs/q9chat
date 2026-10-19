import { randomUUID } from "node:crypto";

import { api } from "@q9chat/convex";
import { ConvexClient } from "convex/browser";
import { expect, type Locator, type Screen } from "e2e";

import { createPhoneAccount, createPhoneGroup, signOutPhone } from "./phone-fixtures.js";
import { deletePhoneProfile, magicCode, removeTestUser, type PhoneSession } from "./workos.js";

export async function runJ4Phone(p: {
  screen: Screen;
  enter: (field: Locator, value: string) => Promise<void>;
  restart: () => Promise<void>;
  shot: (name: string) => Promise<void> | void;
}) {
  const stamp = randomUUID().slice(0, 8);
  const emails = [`q9-j4-phone-${stamp}@example.net`, `q9-j4-peer-${stamp}@example.net`];
  const sessions: PhoneSession[] = [];
  let livePeer: ConvexClient | null = null;
  let liveBodies: string[] = [];
  const [email = "", peerEmail = ""] = emails;
  try {
    const reader = await createPhoneAccount(email, "Nadia Reader", sessions);
    const peer = await createPhoneAccount(peerEmail, "Bilal Writer", sessions);
    const title = `J4 Phone ${stamp}`;
    const groupId = await createPhoneGroup(peer.client, title, reader.id);
    async function received(body: string) {
      const rows = await peer.client.query(api.messages.range, {
        groupId,
        fromSequence: 1,
        toSequence: 100,
      });
      return rows.filter((row) => row.kind === "post" && row.body === body).length;
    }
    livePeer = new ConvexClient("https://quixotic-crab-23.convex.cloud");
    livePeer.setAuth(async () => sessions[1]?.accessToken ?? null);
    livePeer.onUpdate(api.messages.range, { groupId, fromSequence: 1, toSequence: 100 }, (rows) => {
      liveBodies = rows.flatMap((row) => (row.kind === "post" ? [row.body] : []));
    });
    await p.enter(p.screen.getByLabel("Email"), email);
    await p.screen.getByRole("button", "Email me a code").tap();
    await expect(p.screen.getByText("Check your email")).toBeVisible();
    await p.screen
      .getByLabel("6-digit code")
      .pressSequentially(await magicCode(email), { delay: 80 });
    const group = p.screen.getByRole("button", new RegExp(title));
    await expect(group).toBeVisible({ timeout: 30_000 });
    await group.tap();
    const composer = p.screen.getByRole("textbox", new RegExp(`^Message ${title}`));
    await expect(composer).toBeVisible();
    await p.shot("j4-before");
    await p.enter(composer, "Phone live text");
    await expect
      .poll(async () =>
        (await peer.client.query(api.typing.list, { groupId })).some(
          (person) => person.name === "Nadia",
        ),
      )
      .toBe(true);
    await p.screen.getByRole("button", "Send", { exact: true }).tap();
    await expect.poll(() => received("Phone live text")).toBe(1);
    await expect.poll(() => liveBodies.includes("Phone live text")).toBe(true);
    await expect(p.screen.getByLabel("Nadia: Phone live text")).toBeVisible();
    await peer.client.mutation(api.typing.start, { groupId });
    await expect(p.screen.getByText("Bilal is typing…")).toBeVisible();
    await p.shot("j4-live-typing");
    await peer.client.mutation(api.typing.stop, { groupId });
    await p.enter(composer, "Keep this group draft");
    await p.screen.getByRole("button", "Back to groups").tap();
    await group.tap();
    await expect(composer).toHaveValue("Keep this group draft");
    await p.shot("j4-draft");
    await p.screen.getByRole("button", "Send", { exact: true }).tap();
    await expect.poll(() => received("Keep this group draft")).toBe(1);
    await p.enter(composer, "Retry this phone text");
    await fetch("http://localhost:8321/__fault", { method: "POST" });
    await expect(
      p.screen.getByText("You're offline. Retry unsent messages when you're back."),
    ).toBeVisible({ timeout: 30_000 });
    await p.screen.getByRole("button", "Send", { exact: true }).tap();
    await expect(p.screen.getByRole("button", "Retry", { exact: true })).toBeVisible();
    await p.shot("j4-failed");
    await fetch("http://localhost:8321/__fault", { method: "DELETE" });
    await p.restart();
    await expect(group).toBeVisible({ timeout: 60_000 });
    await group.tap();
    await expect(p.screen.getByText("Loading messages…")).not.toBeVisible();
    await expect(p.screen.getByRole("button", "Retry", { exact: true })).toBeVisible();
    await p.screen.getByRole("button", "Retry", { exact: true }).tap();
    await expect.poll(() => received("Retry this phone text")).toBe(1);
    await expect(p.screen.getByRole("button", "Retry", { exact: true })).not.toBeVisible();
    await p.shot("j4-retried");
    await peer.client.mutation(api.groups.removeMember, { groupId, profileId: reader.id });
    await expect(p.screen.getByText("You were removed from this group")).toBeVisible();
    await expect(composer).not.toBeVisible();
    await signOutPhone(p.screen);
  } finally {
    await livePeer?.close();
    await fetch("http://localhost:8321/__fault", { method: "DELETE" });
    await Promise.all(sessions.map((session) => deletePhoneProfile(session)));
    await Promise.all(emails.map((address) => removeTestUser(address)));
  }
}
