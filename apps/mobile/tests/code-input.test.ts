import assert from "node:assert/strict";
import { test } from "node:test";

import {
  backspaceInCode,
  emptyDigits,
  isComplete,
  typeIntoCode,
} from "../src/screens/codeInput.ts";

const cells = (code: string) => Array.from({ length: 6 }, (_, index) => code[index] ?? "");
const joined = (digits: readonly string[]) => digits.join("");

void test("a digit typed into the next empty cell fills it and moves focus on", () => {
  assert.deepEqual(typeIntoCode(cells("12"), 2, "3"), { digits: cells("123"), focus: 3 });
});

void test("correcting a filled cell keeps the digits after it", () => {
  // The cell holds "3"; typing 9 after it reports "39", typing before it reports "93".
  assert.equal(joined(typeIntoCode(cells("123456"), 2, "39")?.digits ?? []), "129456");
  assert.equal(joined(typeIntoCode(cells("123456"), 2, "93")?.digits ?? []), "129456");
});

void test("a paste into a filled cell overwrites only the pasted positions", () => {
  assert.deepEqual(typeIntoCode(cells("123456"), 2, "39876"), {
    digits: cells("129876"),
    focus: 5,
  });
  assert.deepEqual(typeIntoCode(cells("123456"), 1, "2ab98"), {
    digits: cells("198456"),
    focus: 3,
  });
});

void test("a full code pasted into the first cell fills every cell", () => {
  assert.deepEqual(typeIntoCode(emptyDigits(), 0, "123456"), { digits: cells("123456"), focus: 5 });
});

void test("digits past the sixth cell are dropped", () => {
  assert.deepEqual(typeIntoCode(cells("1234"), 4, "56789"), { digits: cells("123456"), focus: 5 });
});

void test("text without digits changes nothing", () => {
  assert.equal(typeIntoCode(cells("12"), 2, "x"), null);
  assert.equal(typeIntoCode(cells("123"), 2, ""), null);
});

void test("backspace clears only its own cell and later digits keep their place", () => {
  const edit = backspaceInCode(cells("123456"), 2);
  assert.deepEqual(edit, { digits: ["1", "2", "", "4", "5", "6"], focus: 2 });
  // Typing 9 into the hole fills just that cell.
  assert.equal(joined(typeIntoCode(edit.digits, 2, "9")?.digits ?? []), "129456");
});

void test("backspace on an empty cell clears the one before and steps back", () => {
  assert.deepEqual(backspaceInCode(["1", "2", "", "", "", ""], 2), {
    digits: ["1", "", "", "", "", ""],
    focus: 1,
  });
  assert.equal(backspaceInCode(emptyDigits(), 0), null);
});

void test("the code is complete only when every cell holds a digit", () => {
  assert.equal(isComplete(cells("123456")), true);
  assert.equal(isComplete(["1", "2", "", "4", "5", "6"]), false);
});
