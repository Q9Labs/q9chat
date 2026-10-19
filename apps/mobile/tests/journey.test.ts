import assert from "node:assert/strict";
import { test } from "node:test";

import { groupRows, msUntilMidnight, rowStamp } from "../src/journey/groupRows.ts";
import { photoUrlOf } from "../src/journey/livePeople.ts";
import { saveThenCheck } from "../src/journey/nameRules.ts";
import { MAX_PHOTO_BYTES, photoTooLarge } from "../src/journey/photoRules.ts";
import { saveSetup, savingSetup } from "../src/journey/setupRules.ts";

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

void test("a pair with no message yet shows the start line with the other person's first name", () => {
  const [row] = groupRows(
    [
      {
        status: "member",
        groupId: "g4",
        kind: "pair",
        title: "Sara Journey",
        avatar,
        lastActivityAt: at("2026-10-18T10:42:00").getTime(),
        preview: { by: null, summary: "" },
        unreadCount: 0,
        needsYou: false,
        notify: "all",
      },
    ],
    "https://x.convex.site",
    now,
  );
  assert.deepEqual(row?.status === "member" ? row.preview : null, {
    by: null,
    summary: "This is the start of your group with Sara",
  });
});

void test("the day labels move on at the next local midnight", () => {
  assert.equal(msUntilMidnight(at("2026-10-18T23:59:00")), 60_000);
  assert.equal(msUntilMidnight(at("2026-10-18T00:00:00")), 24 * 3_600_000);
});

void test("a name save finishes with the screen free to leave only if the field still holds what was saved", async () => {
  let field = "Sara";
  const slow = Promise.withResolvers<void>();
  const saving = saveThenCheck(
    "Sara",
    () => slow.promise,
    () => field,
  );
  field = "Sara Jo";
  slow.resolve();
  assert.equal(await saving, false);

  assert.equal(
    await saveThenCheck(
      "Sara Jo",
      async () => {},
      () => " Sara Jo ",
    ),
    true,
  );
});

void test("a setup save in flight stops writing when the account changes, so the next account's name stays", async () => {
  let signedInAs: string = "a";
  const who = () => signedInAs;
  const slow = Promise.withResolvers<void>();
  const written: string[] = [];
  const saving = saveSetup({
    setUp: () => slow.promise,
    photo: async () => ({}),
    update: async () => {
      written.push(who());
    },
    stillSignedIn: () => signedInAs === "a",
  });
  // The person signs out and account B, which already has a profile, signs in.
  signedInAs = "b";
  slow.resolve();
  assert.equal(await saving, false);
  assert.deepEqual([...written], []);

  signedInAs = "a";
  assert.equal(
    await saveSetup({
      setUp: async () => {},
      photo: async () => ({}),
      update: async () => {
        written.push(who());
      },
      stillSignedIn: () => signedInAs === "a",
    }),
    true,
  );
  assert.deepEqual(written, ["a"]);
});

void test("setup stays up only for the account and the session whose save began, so a sign-out ends it", () => {
  const began = { userId: "user-a", epoch: 3 };
  assert.equal(savingSetup(began, "user-a", 3), true);
  // The same account signs out and back in: the session client counts a new session.
  assert.equal(savingSetup(began, "user-a", 4), false);
  assert.equal(savingSetup(began, "user-b", 3), false);
  assert.equal(savingSetup(null, "user-a", 3), false);
});
