import assert from "node:assert/strict";
import { test } from "node:test";

import { notificationTarget, showPhoneNotification } from "../src/journey/notificationTarget.ts";

void test("phone push opens only an exact group/message destination", () => {
  for (const url of ["/g/abc123?m=42", "q9chat://g/abc123?m=42"])
    assert.deepEqual(notificationTarget({ url }), { groupId: "abc123", m: "42" });
  for (const data of [
    null,
    {},
    { url: 1 },
    { url: "/account" },
    ...[
      "https://evil.example/g/abc?m=1",
      "//evil.example/g/abc?m=1",
      "/g/abc?m=0",
      "/g/abc?m=-1",
      "/g/abc?m=1.5",
      "/g/abc?m=9007199254740992",
      "/g/abc?m=01",
      "/g/abc?m=1&redirect=evil",
      "/g/../account?m=1",
      "/g/abc?m=1#x",
      "/g/abc",
    ].map((url) => ({ url })),
  ])
    assert.equal(notificationTarget(data), null);
});

void test("only the conversation actually on screen suppresses a push", () => {
  const data = { url: "/g/abc123?m=42" };
  assert.equal(showPhoneNotification(data, "/g/abc123"), false);
  for (const path of [null, "/", "/g/other", "/g/abc123/info"])
    assert.equal(showPhoneNotification(data, path), true);
  assert.equal(showPhoneNotification({ url: "/account" }, null), false);
});
