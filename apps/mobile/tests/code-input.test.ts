import assert from "node:assert/strict";
import { test } from "node:test";

import { isComplete, readCode } from "../src/screens/codeInput.ts";

void test("typing adds a digit and only digits count", () => {
  assert.equal(readCode("12", "123"), "123");
  assert.equal(readCode("12", "12x"), "12");
  assert.equal(readCode("", "1 2-3"), "123");
});

void test("backspace and clearing shorten the code", () => {
  assert.equal(readCode("123", "12"), "12");
  assert.equal(readCode("1", ""), "");
});

void test("a full code pasted into an empty field fills it", () => {
  assert.equal(readCode("", "123456"), "123456");
});

void test("a full code pasted over or after existing digits replaces them", () => {
  // The field reports the old digits with the pasted code inside.
  assert.equal(readCode("12", "12654321"), "654321");
  assert.equal(readCode("12", "65432112"), "654321");
  assert.equal(readCode("123456", "123456654321"), "654321");
  assert.equal(readCode("123456", "12365432156"), "654321");
});

void test("a longer paste than the code keeps the first six digits", () => {
  assert.equal(readCode("", "1234567"), "123456");
});

void test("the code is complete at six digits", () => {
  assert.equal(isComplete("123456"), true);
  assert.equal(isComplete("12345"), false);
});
