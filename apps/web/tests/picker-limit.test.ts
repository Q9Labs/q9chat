import assert from "node:assert/strict";
import { test } from "node:test";

import { pickerLimit } from "../src/journey/picker-limit.ts";

void test("add permits 50 people, rejects the 51st, and does not cap creation", () => {
  assert.equal(pickerLimit("add", 50), null);
  assert.equal(pickerLimit("add", 51), "Add up to 50 people at a time.");
  assert.equal(pickerLimit("new", 51), null);
});
