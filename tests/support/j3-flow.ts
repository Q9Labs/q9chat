import { randomUUID } from "node:crypto";

import { api, type Id } from "@q9chat/convex";
import type { ConvexHttpClient } from "convex/browser";
import { expect, type Locator, type Screen } from "e2e";

import { createPhoneAccount } from "./phone-fixtures.js";
import { deletePhoneProfile, magicCode, removeTestUser, type PhoneSession } from "./workos.js";

/** One real member reads another's posts; both native platforms run this same journey. */
export async function runJ3(p: {
  screen: Screen;
  enter: (field: Locator, value: string) => Promise<void>;
  shot: (name: string) => Promise<void> | void;
}) {
  const stamp = randomUUID().replaceAll("-", "").slice(0, 16);
  const emails = [`q9-j3-reader-${stamp}@example.net`, `q9-j3-peer-${stamp}@example.net`];
  const sessions: PhoneSession[] = [];
  try {
    const readerEmail = emails[0];
    const peerEmail = emails[1];
    if (!readerEmail || !peerEmail) throw new Error("Missing test addresses");
    const reader = await createPhoneAccount(readerEmail, "Nadia Reader", sessions);
    const peer = await createPhoneAccount(peerEmail, "Bilal Writer", sessions);
    const title = `J3 Reading ${stamp}`;
    const groupId = await peer.client.mutation(api.groups.create, {
      name: title,
      memberIds: [reader.id],
      inviteToken: stamp,
    });
    async function send(body: string) {
      return peer.client.mutation(api.messages.send, {
        groupId,
        body,
        clientKey: randomUUID(),
        attachments: [],
      });
    }
    await seedHistory(send, reader.client, groupId);
    await p.enter(p.screen.getByLabel("Email"), readerEmail);
    await p.screen.getByRole("button", "Email me a code").tap();
    await expect(p.screen.getByText("Check your email")).toBeVisible();
    await p.screen
      .getByLabel("6-digit code")
      .pressSequentially(await magicCode(readerEmail), { delay: 80 });
    await expect(
      p.screen.getByRole("button", `${title}, Bilal: Reading backlog 104, 100 unread`),
    ).toBeVisible({ timeout: 30_000 });
    await p.screen.getByRole("button", `${title}, Bilal: Reading backlog 104, 100 unread`).tap();
    await expect(p.screen.getByText("New since you last looked")).toBeVisible();
    await expect(p.screen.getByLabel("Bilal: First unread phone post")).toBeVisible();
    await p.shot("j3-opening");
    await p.screen.getByRole("button", "Jump to latest").tap();
    await expect(p.screen.getByLabel("Bilal: Reading backlog 104")).toBeVisible();
    const arrival = await send("Live phone arrival");
    await expect(p.screen.getByLabel("Bilal: Live phone arrival")).toBeVisible();
    await peer.client.mutation(api.typing.start, { groupId });
    await expect(p.screen.getByText("Bilal is typing…")).toBeVisible();
    await expect
      .poll(async () => {
        const post = await p.screen.getByLabel("Bilal: Live phone arrival").boundingBox();
        const typing = await p.screen.getByText("Bilal is typing…").boundingBox();
        if (!post || !typing) return false;
        return post.height >= 24 && post.y + post.height <= typing.y;
      })
      .toBe(true);
    await p.shot("j3-live");
    await peer.client.mutation(api.typing.stop, { groupId });
    // Inspect the private cursor, without exposing it in the product.
    await expect
      .poll(async () => {
        const detail = await reader.client.query(api.groups.get, { groupId });
        return detail?.status === "member" ? detail.lastReadSequence : 0;
      })
      .toBe(arrival.sequence);
    await p.screen.getByRole("button", `Group info for ${title}`).tap();
    await send("Unread behind group info");
    const covered = await reader.client.query(api.groups.get, { groupId });
    if (covered?.status !== "member" || covered.lastReadSequence !== arrival.sequence)
      throw new Error("Covered history advanced read state");
    await peer.client.mutation(api.groups.removeMember, { groupId, profileId: reader.id });
    await expect(p.screen.getByText("You were removed from this group")).toBeVisible();
    await p.screen.getByRole("button", "Back to groups").tap();
    await p.screen.getByRole("button", "Account", { exact: true }).tap();
    await p.screen.getByRole("button", "Sign out", { exact: true }).tap();
    await expect(p.screen.getByRole("button", "Continue with Google")).toBeVisible();
  } finally {
    await cleanAccounts(sessions, emails);
  }
}

async function seedHistory(
  send: (body: string) => Promise<unknown>,
  client: ConvexHttpClient,
  groupId: Id<"groups">,
) {
  // Put the boundary near a page edge, below enough old posts to require a real opening scroll.
  // The unread boundary depends on these posts arriving in sequence.
  // eslint-disable-next-line no-await-in-loop
  for (let i = 0; i < 96; i++) await send(`Earlier post ${i}`);
  await client.mutation(api.readStates.markRead, { groupId, sequence: 98 });
  // More than one page of unread posts proves opening uses the first unread, not the tail.
  // The first post must remain the first unread message.
  for (let i = 0; i < 105; i++) {
    // eslint-disable-next-line no-await-in-loop
    await send(i === 0 ? "First unread phone post" : `Reading backlog ${i}`);
  }
}

async function cleanAccounts(sessions: PhoneSession[], emails: string[]) {
  await Promise.all(sessions.map(deletePhoneProfile));
  await Promise.all(emails.map(removeTestUser));
}
