import assert from "node:assert/strict";
import { test } from "node:test";

import { isWebUrl } from "../src/kit/format.ts";

void test("http and https links open", () => {
  assert.equal(isWebUrl("https://docs.q9labs.ai/launch/checklist"), true);
  assert.equal(isWebUrl("http://example.com"), true);
  assert.equal(isWebUrl("HTTPS://EXAMPLE.COM"), true);
});

void test("other schemes and bare hosts stay plain text", () => {
  assert.equal(isWebUrl("javascript:alert(1)"), false);
  assert.equal(isWebUrl("tel:+4712345678"), false);
  assert.equal(isWebUrl("file:///etc/passwd"), false);
  assert.equal(isWebUrl("docs.q9labs.ai"), false);
  assert.equal(isWebUrl("https://"), false);
  assert.equal(isWebUrl("https://a.com and more"), false);
});
