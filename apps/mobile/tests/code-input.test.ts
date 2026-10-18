import assert from "node:assert/strict";
import { test } from "node:test";

import { typeIntoCode } from "../src/screens/codeInput.ts";

void test("a digit typed into the next empty cell is appended and moves focus on", () => {
  assert.deepEqual(typeIntoCode("12", 2, "3"), { code: "123", focus: 3 });
});

void test("correcting a filled cell keeps the digits after it", () => {
  // The cell holds "3"; typing 9 after it reports "39".
  assert.deepEqual(typeIntoCode("123456", 2, "39"), { code: "129456", focus: 3 });
  // Typing before the old digit reports "93".
  assert.deepEqual(typeIntoCode("123456", 2, "93"), { code: "129456", focus: 3 });
});

void test("a paste into a filled cell overwrites only the pasted positions", () => {
  assert.deepEqual(typeIntoCode("123456", 2, "39876"), { code: "129876", focus: 5 });
  assert.deepEqual(typeIntoCode("123456", 1, "2ab98"), { code: "198456", focus: 3 });
});

void test("a full code pasted into the first cell fills every cell", () => {
  assert.deepEqual(typeIntoCode("", 0, "123456"), { code: "123456", focus: 5 });
});

void test("digits past the sixth cell are dropped", () => {
  assert.deepEqual(typeIntoCode("1234", 4, "56789"), { code: "123456", focus: 5 });
});

void test("text without digits changes nothing", () => {
  assert.equal(typeIntoCode("12", 2, "x"), null);
  assert.equal(typeIntoCode("123", 2, ""), null);
});
