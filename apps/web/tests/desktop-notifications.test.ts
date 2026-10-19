import assert from "node:assert/strict";
import { test } from "node:test";

import { signOutWithNotifications } from "../src/journey/desktop-notifications.ts";

void test("push cleanup failure still retires the authenticated session", async () => {
  let signedOut = false;
  const cleaned = await signOutWithNotifications(
    () => Promise.reject(new Error("Push service unavailable")),
    () => {
      signedOut = true;
      return Promise.resolve();
    },
  );
  assert.equal(signedOut, true);
  assert.equal(cleaned, false);
});

void test(
  "push cleanup that never settles cannot prevent sign-out",
  { timeout: 1_000 },
  async (context) => {
    context.mock.timers.enable({ apis: ["setTimeout"] });
    let signedOut = false;
    const result = signOutWithNotifications(
      () => new Promise<void>(() => {}),
      () => {
        signedOut = true;
        return Promise.resolve();
      },
    );
    context.mock.timers.tick(10_000);
    assert.equal(await result, false);
    assert.equal(signedOut, true);
  },
);
