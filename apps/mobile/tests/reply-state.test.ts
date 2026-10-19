import assert from "node:assert/strict";
import { test } from "node:test";

import { Schema } from "effect";

import { restoreText, SavedText, type LocalAttachment } from "../src/journey/textState.ts";

const attachments: readonly (LocalAttachment | undefined)[] = [
  undefined,
  {
    kind: "image",
    uri: "file:///photo",
    contentType: "image/jpeg",
    size: 10,
    width: 20,
    height: 20,
  },
  { kind: "file", uri: "file:///document", contentType: "text/plain", size: 10, name: "notes.txt" },
  {
    kind: "voice",
    uri: "file:///voice",
    contentType: "audio/mp4",
    size: 10,
    durationMs: 3000,
    waveform: [0.2, 0.5],
  },
];
for (const attachment of attachments) {
  void test(`a restored ${attachment?.kind ?? "text"} reply retries with its original quote`, () => {
    const reply = {
      messageId: "a".repeat(32),
      sequence: 3,
      author: "Bilal",
      summary: "Original message",
    };
    const decoded = Schema.decodeUnknownSync(SavedText)({
      draft: "Next draft",
      pending: [
        {
          clientKey: "same-send",
          body: "Reply",
          attachment,
          reply,
          createdAt: 1,
          status: "sending",
        },
      ],
    });
    const restored = restoreText(decoded);
    assert.equal(restored.draft, "Next draft");
    assert.equal(restored.pending[0]?.status, "failed");
    assert.equal(restored.pending[0].clientKey, "same-send");
    assert.deepEqual(restored.pending[0].reply, reply);
    assert.deepEqual(restored.pending[0].attachment, attachment);
  });
}
void test("saved messages without a quote still restore", () => {
  const decoded = Schema.decodeUnknownSync(SavedText)({
    draft: "",
    pending: [{ clientKey: "old-send", body: "Earlier text", createdAt: 1, status: "failed" }],
  });
  assert.equal(restoreText(decoded).pending[0]?.body, "Earlier text");
  assert.equal(restoreText(decoded).pending[0]?.reply, undefined);
});
