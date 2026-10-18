import assert from "node:assert/strict";
import { test } from "node:test";

import { groupRows, photoUrlOf, rowStamp } from "../src/journey/groupRows.ts";
import { MAX_PHOTO_BYTES, photoTooLarge } from "../src/journey/photoRules.ts";

const at = (iso: string) => new Date(iso);
const now = at("2026-10-18T15:30:00");

void test("a row stamp shows the time today, then Yesterday, a weekday, then the date", () => {
  assert.equal(rowStamp(at("2026-10-18T09:05:00").getTime(), now), "09:05");
  assert.equal(rowStamp(at("2026-10-17T23:59:00").getTime(), now), "Yesterday");
  assert.equal(rowStamp(at("2026-10-15T08:00:00").getTime(), now), "Thu");
  assert.equal(rowStamp(at("2026-10-11T08:00:00").getTime(), now), "11 Oct");
  assert.equal(rowStamp(at("2026-09-30T08:00:00").getTime(), now), "30 Sep");
});

void test("a photo path becomes a URL on the Convex HTTP origin", () => {
  assert.equal(
    photoUrlOf("https://x.convex.site", "/photos/abc"),
    "https://x.convex.site/photos/abc",
  );
  assert.equal(photoUrlOf("https://x.convex.site", null), null);
});

void test("the 20 MB photo cap is exact", () => {
  assert.equal(photoTooLarge(MAX_PHOTO_BYTES), false);
  assert.equal(photoTooLarge(MAX_PHOTO_BYTES + 1), true);
});

const avatar = { color: "#0369a1", lightColor: "#38bdf8", initials: "SJ", photo: null };
const person = {
  id: "p1",
  name: "Sara",
  fullName: "Sara Journey",
  isYou: false,
  deleted: false,
  avatar,
};

void test("live rows become list rows: groups get initials, pairs get a person avatar, removals keep who removed you", () => {
  const rows = groupRows(
    [
      {
        status: "member",
        groupId: "g1",
        kind: "group",
        title: "Journey live group",
        avatar,
        lastActivityAt: at("2026-10-18T10:42:00").getTime(),
        preview: { by: person, summary: "Welcome to the live group" },
        unreadCount: 1,
        needsYou: false,
        notify: "mentions",
      },
      {
        status: "member",
        groupId: "g2",
        kind: "pair",
        title: "Sara Journey",
        avatar: { ...avatar, photo: "/photos/p1" },
        lastActivityAt: at("2026-10-17T10:42:00").getTime(),
        preview: { by: null, summary: "Sara created the group" },
        unreadCount: 0,
        needsYou: true,
        notify: "all",
      },
      {
        status: "removed",
        groupId: "g3",
        kind: "group",
        title: "Old group",
        avatar,
        removedBy: person,
        removedAt: at("2026-10-15T10:00:00").getTime(),
      },
    ],
    "https://x.convex.site",
    now,
  );
  assert.deepEqual(rows, [
    {
      status: "member",
      groupId: "g1",
      title: "Journey live group",
      avatar: { kind: "group", initials: "SJ" },
      whenLabel: "10:42",
      preview: { by: { name: "Sara", isYou: false }, summary: "Welcome to the live group" },
      unreadCount: 1,
      needsYou: false,
      notify: "mentions",
    },
    {
      status: "member",
      groupId: "g2",
      title: "Sara Journey",
      avatar: {
        kind: "person",
        initials: "SJ",
        color: "#0369a1",
        colorOnDark: "#38bdf8",
        photoUrl: "https://x.convex.site/photos/p1",
      },
      whenLabel: "Yesterday",
      preview: { by: null, summary: "Sara created the group" },
      unreadCount: 0,
      needsYou: true,
      notify: "all",
    },
    {
      status: "removed",
      groupId: "g3",
      title: "Old group",
      avatar: { kind: "group", initials: "SJ" },
      removedBy: "Sara",
      whenLabel: "Thu",
    },
  ]);
});
