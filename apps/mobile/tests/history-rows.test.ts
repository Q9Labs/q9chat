import assert from "node:assert/strict";
import test from "node:test";

import {
  pageOf,
  slideWindow,
  visibleSequence,
  sameRun,
  messageSegments,
  historyDay,
  openingOffset,
  typingLabel,
  followAfterScroll,
  messageBounds,
} from "../src/journey/historyRows.ts";

void test("sequence pages include both edges, empty and huge groups", () => {
  for (const [sequence, page] of [
    [0, 0],
    [1, 0],
    [99, 0],
    [100, 0],
    [101, 1],
    [200, 1],
    [10000, 99],
  ])
    assert.equal(pageOf(sequence ?? 0), page);
});

void test("paging stays bounded and every adjacent page is reachable", () => {
  let window = { first: 50, last: 50 };
  for (let i = 0; i < 60; i++) {
    const before = window;
    window = slideWindow(window.first, window.last, "older");
    assert.equal(window.first, Math.max(0, before.first - 1));
    assert.ok(window.last - window.first < 3);
  }
  assert.equal(window.first, 0);
  for (let i = 0; i < 100; i++) {
    const before = window;
    window = slideWindow(window.first, window.last, "newer");
    assert.equal(window.last, before.last + 1);
    assert.ok(window.last - window.first < 3);
  }
});

void test("read cursor includes intersecting messages and handles tall posts", () => {
  const rows = [
    { id: "a", sequence: 10 },
    { id: "b", sequence: 11 },
    { id: "c", sequence: 12 },
  ];
  const boxes = new Map([
    ["a", { y: 0, height: 50 }],
    ["b", { y: 50, height: 60 }],
    ["c", { y: 110, height: 500 }],
  ]);
  for (const [offset, height, expected] of [
    [0, 49, 10],
    [0, 50, 10],
    [0, 109, 11],
    [0, 110, 11],
    [50, 60, 11],
    [110, 200, 12],
    [111, 200, 12],
  ])
    assert.equal(visibleSequence(rows, boxes, offset ?? 0, height ?? 0), expected);
  assert.equal(visibleSequence(rows, new Map(), 0, 300), 0);
  assert.equal(visibleSequence([], boxes, 0, 300), 0);
});

void test("events and rows outside the viewport never advance the cursor", () => {
  assert.equal(
    visibleSequence(
      [{ id: "event", sequence: 99, kind: "event" }],
      new Map([["event", { y: 0, height: 20 }]]),
      0,
      100,
    ),
    0,
  );
});

void test("message grouping breaks at five minutes, a new day, author, or unread boundary", () => {
  const at = new Date(2026, 9, 19, 12).getTime();
  const before = { authorId: "a", createdAt: at };
  assert.equal(sameRun(before, { authorId: "a", createdAt: at + 299999 }, false), true);
  assert.equal(sameRun(before, { authorId: "a", createdAt: at + 300000 }, false), false);
  assert.equal(sameRun(before, { authorId: "b", createdAt: at }, false), false);
  assert.equal(sameRun(before, before, true), false);
  assert.equal(sameRun(null, before, false), false);
  assert.equal(
    sameRun(
      { authorId: "a", createdAt: new Date(2026, 9, 19, 23, 59).getTime() },
      { authorId: "a", createdAt: new Date(2026, 9, 20, 0, 1).getTime() },
      false,
    ),
    false,
  );
});

void test("only current member mentions highlight; links stay links", () => {
  assert.deepEqual(
    messageSegments("Hi @Nadia @Gone https://q9labs.ai", ["nadia"]).map((part) => part.type),
    ["text", "mention", "text", "text", "text", "link"],
  );
  assert.deepEqual(messageSegments("", []), []);
});

void test("day and typing labels use phone wording", () => {
  const today = new Date(2026, 9, 19, 12);
  assert.equal(historyDay(today.getTime(), today), "Today");
  assert.equal(historyDay(new Date(2026, 9, 18, 23).getTime(), today), "Yesterday");
  assert.equal(historyDay(new Date(2026, 9, 17, 12).getTime(), today), "17 October");
  assert.equal(typingLabel([]), null);
  assert.equal(typingLabel(["Bilal"]), "Bilal is typing…");
  assert.equal(typingLabel(["Bilal", "Sara"]), "Bilal and Sara are typing…");
  assert.equal(typingLabel(["Bilal", "Sara", "Omar"]), "3 people are typing…");
});

void test("opening waits for the unread layout and falls back to latest only without unread", () => {
  const rows = [{ id: "first", sequence: 99 }];
  assert.equal(openingOffset(99, rows, new Map(), 1000), null);
  assert.equal(openingOffset(99, rows, new Map([["first", { y: 450 }]]), 1000), 438);
  assert.equal(openingOffset(99, rows, new Map([["first", { y: 5 }]]), 1000), 0);
  assert.equal(openingOffset(null, rows, new Map(), 1000), 1000);
  assert.equal(openingOffset(null, [], new Map(), 0), 0);
});

void test("bottom following survives layout shrink but stops when the reader scrolls back", () => {
  assert.equal(
    followAfterScroll(true, 800, 800, false),
    true,
    "typing shrinks the viewport without moving the reader",
  );
  assert.equal(followAfterScroll(true, 800, 800, true), true);
  assert.equal(followAfterScroll(true, 800, 760, false), false, "scrolling back stops following");
  assert.equal(followAfterScroll(false, 760, 780, false), false);
  assert.equal(
    followAfterScroll(false, 780, 820, true),
    true,
    "reaching the bottom resumes following",
  );
  assert.equal(
    followAfterScroll(true, 800, 400, true),
    true,
    "a bounded-window jump can reduce the offset at the bottom",
  );
});

void test("only message or deleted-placeholder content advances read progress", () => {
  const rows = [{ id: "post", sequence: 99 }];
  for (const leading of [16, 36, 60, 100]) {
    const content = messageBounds({ y: 590 }, { y: leading, height: 48 });
    const layouts = new Map([["post", content]]);
    assert.equal(visibleSequence(rows, layouts, 0, 600), 0, "margin, date, divider or author only");
    assert.equal(visibleSequence(rows, layouts, 0, content.y), 0);
    assert.equal(visibleSequence(rows, layouts, 0, content.y + 1), 99);
    assert.equal(visibleSequence(rows, layouts, content.y + content.height, 100), 0);
  }
});
