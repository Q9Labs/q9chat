import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { test } from "node:test";

import { ConvexError } from "convex/values";

import {
  canMessage,
  groupError,
  membershipLost,
  newInviteToken,
  offered,
  pairCandidate,
  pickerHint,
  pickerLimit,
  pickInto,
} from "../src/journey/groupRules.ts";
import { livePerson } from "../src/journey/livePeople.ts";

void test("adding stops at 50 people per call, and creating a group has no such cap", () => {
  assert.equal(pickerLimit("add", 50), null);
  assert.equal(pickerLimit("add", 51), "Add up to 50 people at a time.");
  assert.equal(pickerLimit("create", 51), null);
});

const hint = (query: string, matches?: { id: string }[], chosen = 0) =>
  pickerHint(query, "me@example.net", matches, chosen);

void test("the people field explains itself while empty, then hints at what was typed", () => {
  assert.deepEqual(hint(""), { kind: "explain" });
  assert.equal(hint("", [], 1), null);
  assert.deepEqual(hint("  Me@Example.net ", []), { kind: "you" });
  assert.deepEqual(hint("new@example.net", []), { kind: "noAccount", email: "new@example.net" });
  assert.equal(hint("new@example.net"), null);
  assert.equal(hint("new@example.net", [{ id: "p" }]), null);
  assert.equal(hint("nadia", []), null);
  assert.deepEqual(hint("a".repeat(101)), { kind: "tooLong" });
  assert.equal(hint("a".repeat(100)), null);
});

void test("exactly one person and no name is a pair; a name, or more people, is a group", () => {
  assert.equal(pairCandidate("", [{ id: "a" }]), "a");
  assert.equal(pairCandidate("   ", [{ id: "a" }]), "a");
  assert.equal(pairCandidate("Launch", [{ id: "a" }]), null);
  assert.equal(pairCandidate("", [{ id: "a" }, { id: "b" }]), null);
  assert.equal(pairCandidate("", []), null);
});

void test("a failed group call reads in plain words, and never blames only the caller or only the picked people", () => {
  const limit = new ConvexError({ code: "too_many_groups" });
  assert.equal(groupError(limit), "You're in 100 groups already. Leave one to make another.");
  assert.match(groupError(limit, 2), /^You or someone you picked is already in 100 groups/u);
  assert.match(
    groupError(new ConvexError({ code: "account_unavailable" }), 1),
    /^You or someone you picked isn't available/u,
  );
  assert.equal(
    groupError(new ConvexError({ code: "pair_locked" }), 3),
    "You can't add people to a group of two. Create a new group instead.",
  );
  assert.equal(groupError(new Error("boom")), "Couldn't complete that. Try again.");
  assert.equal(
    groupError(new ConvexError({ code: "message_too_long" })),
    "Couldn't complete that. Try again.",
  );
});

void test("a new invite token is 16 base62 characters and skips the biased bytes", () => {
  const token = newInviteToken((length) => randomBytes(length));
  assert.match(token, /^[A-Za-z0-9]{16}$/u);
  // Bytes 248 and up are dropped, so a stream of them followed by zeros yields only "A".
  const stream = [new Uint8Array(24).fill(255), new Uint8Array(24).fill(0)];
  assert.equal(
    newInviteToken(() => stream.shift() ?? new Uint8Array(24)),
    "A".repeat(16),
  );
});

const people = (count: number) =>
  Array.from({ length: count }, (_, index) => ({ id: `p${index}` }));

void test("picking the 51st person into an add is refused and leaves the list as it was, in create it goes through", () => {
  const fifty = people(50);
  const refused = pickInto("add", fifty, { id: "extra" });
  assert.equal(refused.people, fifty);
  assert.equal(refused.limit, "Add up to 50 people at a time.");
  assert.equal(pickInto("add", people(49), { id: "extra" }).people.length, 50);
  assert.equal(pickInto("create", fifty, { id: "extra" }).people.length, 51);
});

void test("suggestions leave out people already picked and people already in the group", () => {
  const matches = [{ id: "a" }, { id: "b" }, { id: "c" }];
  assert.deepEqual(offered(matches, [{ id: "a" }], ["c"]), [{ id: "b" }]);
});

void test("Message is offered for a member who is someone else and has an account, never for a deleted one or yourself", () => {
  assert.equal(canMessage({ deleted: false, isYou: false }), true);
  assert.equal(canMessage({ deleted: true, isYou: false }), false);
  assert.equal(canMessage({ deleted: false, isYou: true }), false);
});

void test("Group info closes when the group stops being yours: gone, no access or removed, but not while it loads", () => {
  const notAnswered = new Map<string, { status: string }>().get("group");
  assert.equal(membershipLost(notAnswered), false);
  assert.equal(membershipLost(null), true);
  assert.equal(membershipLost({ status: "removed" }), true);
  assert.equal(membershipLost({ status: "member" }), false);
});

const avatar = { color: "#0369a1", lightColor: "#38bdf8", initials: "BB", photo: null } as const;

void test("a person shows an email only when the server sent one for an exact match", () => {
  const found = { id: "p1", name: "Bilal", fullName: "Bilal Beta", avatar };
  assert.equal(
    livePerson({ ...found, email: "bilal@example.net" }, "https://x").email,
    "bilal@example.net",
  );
  assert.equal(livePerson({ ...found, email: null }, "https://x").email, "");
  const member = { ...found, isYou: false, deleted: false };
  assert.equal(livePerson(member, "https://x").email, "");
});
