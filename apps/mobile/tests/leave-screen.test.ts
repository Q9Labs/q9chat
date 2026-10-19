import assert from "node:assert/strict";
import { test } from "node:test";

import { leaveAfterAdd, leaveScreen } from "../src/journey/leaveScreen.ts";

/** The part of the router `leaveScreen` uses, recording what it was asked to do. */
function fakeRouter(canGoBack: boolean) {
  const calls: string[] = [];
  const router = {
    canGoBack: () => canGoBack,
    back: () => calls.push("back"),
    replace: (href: "/") => calls.push(`replace ${href}`),
  };
  return { router, calls };
}

void test("a screen with something behind it goes back", () => {
  const { router, calls } = fakeRouter(true);
  leaveScreen(router);
  assert.deepEqual(calls, ["back"]);
});

void test("a screen opened cold by a link, with nothing behind it, goes to Groups", () => {
  const { router, calls } = fakeRouter(false);
  leaveScreen(router);
  assert.deepEqual(calls, ["replace /"]);
});

void test("a successful add with nothing behind the form releases the guard, leaves a line, and goes to Groups", () => {
  const { router, calls } = fakeRouter(false);
  leaveAfterAdd(
    router,
    () => calls.push("release"),
    (line) => calls.push(`notice ${line}`),
  );
  assert.deepEqual(calls, ["release", "notice Group updated", "replace /"]);
});

void test("a successful add from Group info goes back to it", () => {
  const { router, calls } = fakeRouter(true);
  leaveAfterAdd(
    router,
    () => calls.push("release"),
    (line) => calls.push(`notice ${line}`),
  );
  assert.deepEqual(calls, ["release", "notice Group updated", "back"]);
});
