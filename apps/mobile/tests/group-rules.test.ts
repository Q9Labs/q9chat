import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { test } from "node:test";

import { ConvexError } from "convex/values";

import {
  groupError,
  newInviteToken,
  pairCandidate,
  pickerHint,
  pickerLimit,
} from "../src/journey/groupRules.ts";

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
