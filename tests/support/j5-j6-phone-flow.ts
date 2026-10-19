import { randomUUID } from "node:crypto";

import { api } from "@q9chat/convex";
import { ConvexClient } from "convex/browser";
import type { FunctionReturnType } from "convex/server";
import { expect, type Locator, type Screen } from "e2e";

import {
  cleanPhoneAccounts,
  removePhoneReader,
  createPhoneAccount,
  createPhoneGroup,
  phoneEmails,
  signInPhoneUi,
} from "./phone-fixtures.js";
import { type PhoneSession } from "./workos.js";

type Row = FunctionReturnType<typeof api.messages.range>[number];
// A quoted row can enter the accessibility tree before its scroll position settles.
async function holdWhenStill(target: Locator) {
  let previous = "";
  let since = Date.now();
  await expect
    .poll(
      async () => {
        const box = await target.boundingBox();
        const current = JSON.stringify(box);
        if (!box || current !== previous) {
          previous = current;
          since = Date.now();
        }
        return box !== null && Date.now() - since >= 750;
      },
      { timeout: 10_000, interval: 200 },
    )
    .toBe(true);
  await target.longPress();
}

export async function runJ5J6Phone(p: {
  screen: Screen;
  enter: (field: Locator, value: string) => Promise<void>;
  submitEmail?: () => Promise<void>;
  shot: (name: string) => Promise<void> | void;
}) {
  const { stamp, email, peerEmail, emails } = phoneEmails("actions");
  const sessions: PhoneSession[] = [];
  let livePeer: ConvexClient | null = null;
  let rows: Row[] = [];
  try {
    const [reader, peer] = await Promise.all([
      createPhoneAccount(email, "Nadia Reader", sessions),
      createPhoneAccount(peerEmail, "Bilal Writer", sessions),
    ]);
    const title = `Actions ${stamp}`;
    const groupId = await createPhoneGroup(peer.client, title, reader.id);
    const original = await peer.client.mutation(api.messages.send, {
      groupId,
      clientKey: randomUUID(),
      body: "A message to quote",
      attachments: [],
    });
    for (let batch = 0; batch < 31; batch++) {
      await Promise.all(
        Array.from({ length: 10 }, (_, index) =>
          peer.client.mutation(api.messages.send, {
            groupId,
            clientKey: randomUUID(),
            body: `History ${batch * 10 + index}`,
            attachments: [],
          }),
        ),
      );
    }
    await reader.client.mutation(api.messages.send, {
      groupId,
      clientKey: randomUUID(),
      body: "My account keeps this message",
      attachments: [],
    });
    const last = await peer.client.mutation(api.messages.send, {
      groupId,
      clientKey: randomUUID(),
      body: "Jump back to that earlier message",
      replyToId: original.messageId,
      attachments: [],
    });
    await reader.client.mutation(api.readStates.markRead, { groupId, sequence: last.sequence });
    livePeer = new ConvexClient("https://quixotic-crab-23.convex.cloud");
    livePeer.setAuth(async () => peer.accessToken);
    livePeer.onUpdate(
      api.messages.range,
      { groupId, fromSequence: 300, toSequence: 399 },
      (value) => {
        rows = value;
      },
    );
    await signInPhoneUi(p, email);
    await p.screen.getByRole("button", title, { exact: false }).tap();
    await expect(p.screen.getByLabel("Bilal: Jump back to that earlier message")).toBeVisible();
    await p.shot("actions-before");
    await p.screen.getByRole("button", "Quoted message from Bilal. Go to it.").tap();
    const originalBubble = p.screen.getByLabel("Bilal: A message to quote", { exact: true });
    await expect(originalBubble).toBeVisible();
    await holdWhenStill(originalBubble);
    await expect(p.screen.getByRole("button", "Report", { exact: true })).toBeVisible();
    await expect(p.screen.getByRole("button", "Edit", { exact: true })).not.toBeVisible();
    await p.shot("actions-sheet");
    await p.screen.getByRole("button", "Reply", { exact: true }).tap();
    await p.enter(p.screen.getByRole("textbox", /^Message(?: |$)/), "Reply from phone");
    await p.screen.getByRole("button", "Send", { exact: true }).tap();
    await expect
      .poll(() =>
        rows.some(
          (row) =>
            row.kind === "post" &&
            row.body === "Reply from phone" &&
            row.replyTo?.id === original.messageId,
        ),
      )
      .toBe(true);
    await holdWhenStill(p.screen.getByLabel("Nadia: Reply from phone", { exact: true }));
    await p.screen.getByRole("button", "Edit", { exact: true }).tap();
    await p.screen.getByRole("textbox", /^Message(?: |$)/).fill("");
    await p.enter(p.screen.getByRole("textbox", /^Message(?: |$)/), "Edited from phone");
    await fetch("http://localhost:8321/__fault", { method: "POST" });
    await expect(
      p.screen.getByText("You're offline. Retry unsent messages when you're back."),
    ).toBeVisible({ timeout: 30_000 });
    await p.screen.getByRole("button", "Save edit", { exact: true }).tap();
    await expect(p.screen.getByText("You're offline. Try again when you're back.")).toBeVisible();
    expect(rows.some((row) => row.kind === "post" && row.body === "Edited from phone")).toBe(false);
    await fetch("http://localhost:8321/__fault", { method: "DELETE" });
    await expect(
      p.screen.getByText("You're offline. Retry unsent messages when you're back."),
    ).not.toBeVisible({ timeout: 30_000 });
    await p.screen.getByRole("button", "Save edit", { exact: true }).tap();
    await expect
      .poll(() =>
        rows.some(
          (row) => row.kind === "post" && row.body === "Edited from phone" && row.editedAt !== null,
        ),
      )
      .toBe(true);
    await holdWhenStill(p.screen.getByLabel("Nadia: Edited from phone", { exact: true }));
    await p.screen.getByRole("button", "React with 👍", { exact: true }).tap();
    await expect
      .poll(() =>
        rows.some(
          (row) =>
            row.kind === "post" &&
            row.body === "Edited from phone" &&
            row.reactions.some((reaction) => reaction.emoji === "👍" && reaction.count === 1),
        ),
      )
      .toBe(true);
    const reaction = p.screen.getByRole("button", /^👍 1:/);
    await holdWhenStill(reaction);
    await expect(p.screen.getByText("Reactions", { exact: true })).toBeVisible();
    await expect(p.screen.getByText("You", { exact: true })).toBeVisible();
    await p.shot("actions-reactions");
    await p.screen.getByRole("button", "Close", { exact: true }).tap();
    await p.screen.getByRole("button", "Quoted message from Bilal. Go to it.").last().tap();
    await expect(originalBubble).toBeVisible();
    await holdWhenStill(originalBubble);
    await p.screen.getByRole("button", "Report", { exact: true }).tap();
    await p.screen.getByRole("radio", "Spam", { exact: true }).tap();
    await p.screen.getByRole("button", "Send report", { exact: true }).tap();
    await expect(p.screen.getByText("Thanks. We'll review this message.")).toBeVisible();
    await p.screen.getByRole("button", "Jump to latest", { exact: true }).tap();
    await holdWhenStill(p.screen.getByLabel("Nadia: Edited from phone", { exact: true }));
    await p.screen.getByRole("button", "Delete", { exact: true }).tap();
    await expect(p.screen.getByText("Delete this message?")).toBeVisible();
    await p.screen.getByRole("button", "Delete", { exact: true }).tap();
    await expect(p.screen.getByLabel("Nadia: Message deleted", { exact: true })).toBeVisible();
    await expect
      .poll(() => rows.some((row) => row.kind === "deleted" && row.author.id === reader.id))
      .toBe(true);
    await p.shot("actions-after");
    await removePhoneReader({
      client: peer.client,
      groupId,
      readerId: reader.id,
      screen: p.screen,
    });
    await p.screen.getByRole("button", "Back to groups").tap();
    await p.screen.getByRole("button", "Account", { exact: true }).tap();
    await p.screen.getByRole("button", "Delete account", { exact: true }).tap();
    await expect(p.screen.getByText("Delete your account?")).toBeVisible();
    await p.shot("account-delete");
    await p.screen.getByRole("button", "Delete account", { exact: true }).last().tap();
    await expect(p.screen.getByRole("button", "Continue with Google")).toBeVisible({
      timeout: 30_000,
    });
    await expect
      .poll(() =>
        rows.some(
          (row) =>
            row.kind === "post" &&
            row.body === "My account keeps this message" &&
            row.author.name === "Deleted account",
        ),
      )
      .toBe(true);
    await p.shot("account-deleted");
  } catch (error) {
    await p.shot("actions-pre-cleanup-failure");
    throw error;
  } finally {
    await fetch("http://localhost:8321/__fault", { method: "DELETE" });
    await livePeer?.close();
    await cleanPhoneAccounts(sessions, emails);
  }
}
