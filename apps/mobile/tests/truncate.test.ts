import assert from "node:assert/strict";
import { test } from "node:test";

import { characterClusters, truncate } from "../src/kit/format.ts";

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

void test("a family emoji and an accented letter count as one character each", () => {
  const family = "👨‍👩‍👧";
  assert.equal(truncate(`${family}${family}${family}`, 3), `${family}${family}${family}`);
  assert.equal(truncate(`${family}${family}${family}${family}`, 3), `${family}${family}…`);
  assert.equal(truncate("café au lait", 5), "café…");
});

void test("without Intl.Segmenter, as on Hermes, clusters keep joiners, marks, skin tones and flags whole", () => {
  const family = "👨‍👩‍👧";
  const wave = "👋🏽";
  const flag = "🇳🇴";
  assert.deepEqual(characterClusters(`a${family}${wave}${flag}${flag}e\u0301!`), [
    "a",
    family,
    wave,
    flag,
    flag,
    "e\u0301",
    "!",
  ]);
  assert.deepEqual(characterClusters("🇳🇴🇸🇪🇩"), ["🇳🇴", "🇸🇪", "🇩"]);
});
