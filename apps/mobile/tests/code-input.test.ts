import assert from "node:assert/strict";
import { test } from "node:test";

import { isComplete, readCode } from "../src/screens/codeInput.ts";

const at = (position: number) => ({ start: position, end: position });

void test("typing adds a digit where the cursor is, and only digits count", () => {
  assert.equal(readCode("12", "123", at(2)), "123");
  assert.equal(readCode("12", "12x", at(2)), "12");
  assert.equal(readCode("", "1 2-3", at(0)), "123");
  assert.equal(readCode("13", "123", at(1)), "123");
});

void test("backspace and clearing shorten the code", () => {
  assert.equal(readCode("123", "12", at(3)), "12");
  assert.equal(readCode("1", "", at(1)), "");
  assert.equal(readCode("123", "13", at(2)), "13");
});

void test("a full code pasted into an empty field fills it", () => {
  assert.equal(readCode("", "123456", at(0)), "123456");
});

void test("a full code pasted before, after or in the middle of existing digits replaces them", () => {
  // The field reports the old digits with the pasted code inside.
  assert.equal(readCode("1", "1234561", at(0)), "123456");
  assert.equal(readCode("12", "12345612", at(0)), "123456");
  assert.equal(readCode("1", "1123456", at(1)), "123456");
  assert.equal(readCode("12", "12654321", at(2)), "654321");
  assert.equal(readCode("123456", "123456654321", at(6)), "654321");
  assert.equal(readCode("123456", "123654321456", at(3)), "654321");
});

void test("a paste over a selection replaces only the selection", () => {
  assert.equal(readCode("123456", "9", { start: 0, end: 6 }), "9");
  assert.equal(readCode("123456", "129456", { start: 2, end: 4 }), "129456");
  assert.equal(readCode("123456", "1294", { start: 2, end: 6 }), "1294");
});

void test("a longer paste than the code keeps the first six digits", () => {
  assert.equal(readCode("", "1234567", at(0)), "123456");
});

void test("a selection that no longer matches the text falls back to the field's digits", () => {
  assert.equal(readCode("12", "9876", at(2)), "9876");
});

void test("the code is complete at six digits", () => {
  assert.equal(isComplete("123456"), true);
  assert.equal(isComplete("12345"), false);
});
