import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { api, type Id } from "@q9chat/convex";
import { ConvexClient } from "convex/browser";
import { expect, type Locator, type Screen } from "e2e";
import { Schema } from "effect";

import {
  createPhoneAccount,
  createPhoneGroup,
  phoneEmails,
  signInPhoneUi,
  signOutPhone,
} from "./phone-fixtures.js";
import { deletePhoneProfile, removeTestUser, type PhoneSession } from "./workos.js";

export async function runJ4bPhone(p: {
  screen: Screen;
  voice: "record" | "peer";
  enter: (field: Locator, value: string) => Promise<void>;
  submitEmail?: () => Promise<void>;
  pickPhoto: () => Promise<void>;
  pickFile: () => Promise<void>;
  openFile: () => Promise<void>;
  shot: (name: string) => Promise<void> | void;
}) {
  const { stamp, email, peerEmail, emails } = phoneEmails("j4b");
  const sessions: PhoneSession[] = [];
  let livePeer: ConvexClient | null = null;
  let kinds: string[] = [];
  try {
    const reader = await createPhoneAccount(email, "Nadia Reader", sessions);
    const peer = await createPhoneAccount(peerEmail, "Bilal Writer", sessions);
    const title = `J4b Phone ${stamp}`;
    const groupId = await createPhoneGroup(peer.client, title, reader.id);
    livePeer = new ConvexClient("https://quixotic-crab-23.convex.cloud");
    livePeer.setAuth(async () => sessions[1]?.accessToken ?? null);
    livePeer.onUpdate(api.messages.range, { groupId, fromSequence: 1, toSequence: 100 }, (rows) => {
      kinds = rows.flatMap((row) =>
        row.kind === "post" ? row.attachments.map((file) => file.kind) : [],
      );
    });
    await signInPhoneUi(p, email);
    await p.screen.getByRole("button", title, { exact: false }).tap();
    await expect(p.screen.getByRole("textbox", /^Message(?: |$)/)).toBeVisible();
    await expect(p.screen.getByText("Loading messages…", { exact: true })).not.toBeVisible();
    await p.shot("j4b-before");
    await p.screen.getByRole("button", "Attach a photo or file").tap();
    await expect(p.screen.getByRole("button", "Photo", { exact: true })).toBeVisible();
    await p.shot("j4b-attach-sheet");
    await p.screen.getByRole("button", "Photo", { exact: true }).tap();
    await p.pickPhoto();
    await expect.poll(() => kinds).toEqual(["image"]);
    await expect(p.screen.getByLabel("Photo attachment")).toBeVisible();
    await p.screen.getByRole("button", "Attach a photo or file").tap();
    await p.screen.getByRole("button", "File", { exact: true }).tap();
    await p.pickFile();
    await expect.poll(() => kinds).toEqual(["image", "file"]);
    await expect(
      p.screen.getByRole("button", "Open q9-attachment.txt", { exact: true }),
    ).toBeVisible();
    await p.screen.getByRole("button", "Open q9-attachment.txt", { exact: true }).tap();
    await p.openFile();
    await p.screen.getByRole("button", "Record a voice note").tap();
    if (p.voice === "record") {
      await expect(p.screen.getByText("Recording", { exact: true })).toBeVisible();
      await expect(p.screen.getByText(/^0:(?:0[3-9]|[1-5][0-9])$/u)).toBeVisible();
      await p.shot("j4b-recording");
      await fetch("http://localhost:8321/__uploadFault", { method: "POST" });
      await p.screen.getByRole("button", "Send voice note").tap();
    } else {
      await expect(p.screen.getByRole("button", "Cancel", { exact: true })).toBeVisible();
      await p.shot("j4b-recorder-open");
      await p.screen.getByRole("button", "Cancel", { exact: true }).tap();
      await expect(p.screen.getByRole("button", "Record a voice note")).toBeVisible();
      await fetch("http://localhost:8321/__uploadFault", { method: "POST" });
      await p.screen.getByRole("button", "Attach a photo or file").tap();
      await p.screen.getByRole("button", "File", { exact: true }).tap();
      await p.pickFile();
    }
    await expect(p.screen.getByRole("button", "Retry", { exact: true })).toBeVisible();
    await p.shot("j4b-retry");
    await fetch("http://localhost:8321/__uploadFault", { method: "DELETE" });
    await fetch("http://localhost:8321/__fault", { method: "POST" });
    await expect(
      p.screen.getByText("You're offline. Retry unsent messages when you're back."),
    ).toBeVisible({ timeout: 30_000 });
    await p.screen.getByRole("button", "Retry", { exact: true }).tap();
    expect(kinds).toEqual(["image", "file"]);
    await fetch("http://localhost:8321/__fault", { method: "DELETE" });
    await expect(
      p.screen.getByText("You're offline. Retry unsent messages when you're back."),
    ).not.toBeVisible({ timeout: 30_000 });
    await p.screen.getByRole("button", "Retry", { exact: true }).tap();
    await expect
      .poll(() => kinds)
      .toEqual(["image", "file", p.voice === "record" ? "voice" : "file"]);
    const peerSession = sessions[1];
    if (!peerSession) throw new Error("Missing peer session");
    const response = await fetch("https://quixotic-crab-23.convex.site/upload", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${peerSession.accessToken}`,
        "Content-Type": "audio/mp4",
      },
      body: await readFile(new URL("../fixtures/phone-voice.m4a", import.meta.url)),
    });
    expect(response.status).toBe(200);
    const { uploadId } = Schema.decodeUnknownSync(
      Schema.Struct({
        uploadId: Schema.String.pipe(
          Schema.filter((id): id is Id<"uploads"> => /^[a-z0-9]{32}$/u.test(id)),
        ),
      }),
    )(await response.json());
    await peer.client.mutation(api.messages.send, {
      groupId,
      clientKey: randomUUID(),
      body: "",
      attachments: [
        { kind: "voice", uploadId, durationMs: 12_000, waveform: [0.3, 0.5, 0.8, 0.5] },
      ],
    });
    await expect
      .poll(() => kinds)
      .toEqual(["image", "file", p.voice === "record" ? "voice" : "file", "voice"]);
    await expect(p.screen.getByRole("button", "Retry")).not.toBeVisible();
    await expect(p.screen.getByText("Sending", { exact: false })).not.toBeVisible();
    await expect(p.screen.getByText("0:12", { exact: true })).toBeVisible();
    await p.screen.getByRole("button", "Play voice note").last().tap();
    await expect(p.screen.getByRole("button", "Pause voice note")).toBeVisible();
    await expect(p.screen.getByText(/^0:0[12]$/u)).toBeVisible();
    await expect(
      p.screen.getByText("Couldn't play voice note · Tap Play to retry."),
    ).not.toBeVisible();
    await p.shot("j4b-after");
    await p.screen.getByRole("button", "Pause voice note").tap();
    await peer.client.mutation(api.groups.removeMember, { groupId, profileId: reader.id });
    await expect(p.screen.getByText("You were removed from this group")).toBeVisible();
    await expect(p.screen.getByRole("textbox", /^Message(?: |$)/)).not.toBeVisible();
    await expect(p.screen.getByLabel("Photo attachment")).not.toBeVisible();
    await p.shot("j4b-removed");
    await signOutPhone(p.screen);
  } catch (error) {
    await p.shot("j4b-pre-cleanup-failure");
    throw error;
  } finally {
    await fetch("http://localhost:8321/__uploadFault", { method: "DELETE" });
    await fetch("http://localhost:8321/__fault", { method: "DELETE" });
    await livePeer?.close();
    await Promise.all(sessions.map((session) => deletePhoneProfile(session)));
    await Promise.all(emails.map((address) => removeTestUser(address)));
  }
}
