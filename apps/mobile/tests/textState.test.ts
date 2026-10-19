import assert from "node:assert/strict";
import { test } from "node:test";

import { normalizeText, restoreText } from "../src/journey/textState.ts";

void test("text send keeps leading whitespace and line breaks, removes trailing whitespace", () => {
  for (const [draft, body] of [
    [" hello \n", " hello"],
    ["one\ntwo", "one\ntwo"],
    ["   \n", ""],
    ["مرحبا 🙂", "مرحبا 🙂"],
    ["", ""],
  ]) {
    assert.equal(normalizeText(draft ?? ""), body);
  }
});
void test("restart retains each client key and draft but interrupted sends require Retry", () => {
  const saved = {
    draft: "next message",
    pending: [
      { clientKey: "first", body: "hello", createdAt: 1, status: "sending" },
      { clientKey: "second", body: "again", createdAt: 2, status: "failed" },
    ],
  } as const;
  assert.deepEqual(restoreText(saved), {
    ...saved,
    pending: saved.pending.map((post) => ({ ...post, status: "failed" })),
  });
  assert.equal(saved.pending[0].status, "sending");
  assert.deepEqual(restoreText({ draft: "", pending: [] }), { draft: "", pending: [] });
});
