import assert from "node:assert/strict";
import { test } from "node:test";

import { ConvexError } from "convex/values";

import { journeyError } from "../src/journey/group-errors.ts";

void test("account errors describe the actual picked-person count", () => {
  const limit = new ConvexError({ code: "too_many_groups" });
  const unavailable = new ConvexError({ code: "account_unavailable" });
  assert.equal(journeyError(limit, 0), "You're in 100 groups already. Leave one to make another.");
  assert.equal(journeyError(limit, 1), "You or someone you picked is already in 100 groups.");
  assert.equal(journeyError(limit, 2), "You or someone you picked is already in 100 groups.");
  assert.equal(journeyError(unavailable, 0), "This account isn't available. Try signing in again.");
  assert.equal(
    journeyError(unavailable, 1),
    "Someone you picked is no longer available. Remove them to continue.",
  );
});
