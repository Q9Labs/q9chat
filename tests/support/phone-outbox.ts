import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { Schema } from "effect";

import { SavedText } from "../../apps/mobile/src/journey/textState.js";
import { adb } from "./android.js";
import { filesBelow } from "./phone-media.js";

type Platform = "ios" | "android";
const udid = process.env["J1_PHONE_UDID"] ?? "DC55017E-BBF2-42B4-A00C-6B08864EFF51";
const bundle = "ai.q9labs.chat";

function outbox(platform: Platform, profile: string, group: string) {
  const paths =
    platform === "ios"
      ? filesBelow(
          join(
            execFileSync("xcrun", ["simctl", "get_app_container", udid, bundle, "data"], {
              encoding: "utf8",
            }).trim(),
            "Documents",
          ),
        )
      : adb("shell", "run-as", bundle, "find", "files", "-type", "f").toString().trim().split("\n");
  const path = paths.find((name) => name.endsWith(`/q9-text-${profile}-${group}.json`));
  assert.ok(path, "The durable group outbox must exist");
  const read = (file: string) =>
    platform === "ios" ? readFileSync(file) : adb("exec-out", "run-as", bundle, "cat", file);
  return {
    path,
    read,
    saved: Schema.decodeUnknownSync(SavedText)(JSON.parse(read(path).toString())),
  };
}

export function stopPhone(platform: Platform) {
  if (platform === "ios") execFileSync("xcrun", ["simctl", "terminate", udid, bundle]);
  else adb("shell", "am", "force-stop", bundle);
}

/** The simulator has no microphone: replace the failed file with a voice fixture while stopped. */
export function fixturePendingVoice(profile: string, group: string) {
  const box = outbox("ios", profile, group);
  const pending = box.saved.pending.find((post) => post.status === "failed" && post.attachment);
  assert.ok(pending?.attachment);
  const uri = pending.attachment.uri;
  const bytes = readFileSync(new URL("../fixtures/phone-voice.m4a", import.meta.url));
  writeFileSync(fileURLToPath(uri), bytes);
  writeFileSync(
    box.path,
    JSON.stringify({
      ...box.saved,
      pending: box.saved.pending.map((post) =>
        post.clientKey === pending.clientKey
          ? {
              ...post,
              attachment: {
                kind: "voice",
                uri,
                contentType: "audio/mp4",
                size: bytes.length,
                durationMs: 12_000,
                waveform: [0.3, 0.5, 0.8, 0.5],
              },
            }
          : post,
      ),
    }),
  );
}

export function phoneOutboxSnapshot(platform: Platform, profile: string, group: string) {
  const box = outbox(platform, profile, group);
  const voice = box.saved.pending.find(
    (post) => post.status === "failed" && post.attachment?.kind === "voice",
  );
  assert.ok(voice?.attachment, "A failed voice note must remain in the outbox");
  const snapshot = {
    draft: box.saved.draft,
    clientKey: voice.clientKey,
    textSha256: createHash("sha256").update(box.read(box.path)).digest("hex"),
    voiceSha256: createHash("sha256")
      .update(box.read(fileURLToPath(voice.attachment.uri)))
      .digest("hex"),
  };
  appendFileSync(
    join(tmpdir(), `q9-phone-offline-restart-${platform}.jsonl`),
    `${JSON.stringify(snapshot)}\n`,
  );
  return snapshot;
}
