import assert from "node:assert/strict";
import { test } from "node:test";

import { eventItems, eventSegments } from "../src/journey/groupEvents.ts";

const hasan = { name: "Hasan", isYou: false };
const me = { name: "Nadia", isYou: true };
const people = ["Bilal", "Sara", "Omar"].map((name) => ({ name, isYou: false }));
const text = (segments: readonly { text: string }[]) => segments.map((s) => s.text).join("");

void test("a created group reads 'You created this group' for the creator", () => {
  assert.equal(text(eventSegments({ type: "created", by: me })), "You created this group");
  assert.equal(text(eventSegments({ type: "created", by: hasan })), "Hasan created this group");
});

void test("added names read as a list, and leftover people become a count", () => {
  const added = (who: typeof people, othersCount = 0) =>
    text(eventSegments({ type: "added", by: hasan, people: who, othersCount }));
  assert.equal(added(people.slice(0, 1)), "Hasan added Bilal");
  assert.equal(added(people.slice(0, 2)), "Hasan added Bilal and Sara");
  assert.equal(added(people), "Hasan added Bilal, Sara and Omar");
  assert.equal(added(people, 4), "Hasan added Bilal, Sara, Omar and 4 others");
});

void test("the names are strong and the verb is not", () => {
  assert.deepEqual(eventSegments({ type: "removed", by: hasan, person: people[0] ?? hasan }), [
    { text: "Hasan", strong: true },
    { text: " removed ", strong: false },
    { text: "Bilal", strong: true },
  ]);
});

void test("joined and left put the person first", () => {
  assert.equal(text(eventSegments({ type: "joined", person: people[1] ?? hasan })), "Sara joined");
  assert.equal(text(eventSegments({ type: "left", person: me })), "You left");
});

void test("a pair starts with its start line; a group shows only its events", () => {
  const events = [{ id: "e1", event: { type: "created", by: me } as const }];
  const pair = eventItems("pair", hasan, events);
  assert.equal(pair.length, 2);
  assert.equal(
    pair[0]?.type === "system" && text(pair[0].segments),
    "This is the start of your group with Hasan",
  );
  assert.equal(eventItems("group", null, events).length, 1);
});
