import assert from "node:assert/strict";
import { test } from "node:test";

import { historyOpening } from "../src/journey/historyTarget.ts";
import {
  retainSearchHits,
  searchSequence,
  splitSearchSnippet,
} from "../src/journey/searchRules.ts";

void test("only positive safe integer message links select a history entry", () => {
  for (const value of [undefined, "", "0", "-1", "1.5", "NaN", "1e2", "01", "9007199254740992"])
    assert.equal(searchSequence(value), null);
  for (const value of ["1", "100", "9007199254740991"])
    assert.equal(searchSequence(value), Number(value));
});

void test("snippets preserve text and emphasize the last typed word without regex interpretation", () => {
  for (const [text, query, match] of [
    ["Hello TEAM today", "team", "TEAM"],
    ["Hello team today", "hello tea", "tea"],
    ["a+b today", "a+b", "a+b"],
    ["hello", "missing", ""],
    ["hello", "", ""],
    // cspell:ignore بالفريق بالف
    ["مرحبا بالفريق", "بالف", "بالف"],
  ]) {
    if (text === undefined || query === undefined) throw new Error("Missing case");
    const parts = splitSearchSnippet(text, query);
    assert.equal(parts.match, match);
    assert.equal(parts.before + parts.match + parts.after, text);
  }
});

void test("a search destination positions history without moving its unread boundary", () => {
  const group = { firstUnreadSequence: 81, lastReadSequence: 80, lastSequence: 305 };
  assert.deepEqual(historyOpening(group, 1), { unread: 1, boundary: 81, read: 80, target: 1 });
  assert.deepEqual(historyOpening(group, 306), {
    unread: 81,
    boundary: 81,
    read: 80,
    target: null,
  });
  assert.equal(historyOpening(group, null).unread, 81);
});

void test("membership loss discards cached and late search snippets for scoped and all-group searches", () => {
  const hits = [
    { groupId: "left", snippet: "private left message" },
    { groupId: "removed", snippet: "private removed message" },
    { groupId: "kept", snippet: "still a member" },
  ];
  const members = new Set(["kept"]);
  const retained = retainSearchHits(hits, members);
  assert.deepEqual(retained, [hits[2]]);
  assert.deepEqual(retainSearchHits(hits.slice(0, 1), members), []);
  assert.deepEqual(retainSearchHits(hits, new Set()), []);
  assert.deepEqual(retainSearchHits(retained, members), retained);
});
