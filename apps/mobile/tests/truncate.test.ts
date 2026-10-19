import assert from "node:assert/strict";
import { test } from "node:test";

import { truncate } from "../src/kit/format.ts";

void test("short text is left alone", () => {
  assert.equal(truncate("Q9 launch", 28), "Q9 launch");
});

void test("long text is cut to the limit with an ellipsis", () => {
  assert.equal(truncate("abcdefghij", 5), "abcd…");
});

void test("an emoji at the cut is dropped whole, never split", () => {
  assert.equal(truncate("ab😀😀😀", 4), "ab😀…");
  assert.equal(truncate("a😀b", 3), "a😀b");
});
