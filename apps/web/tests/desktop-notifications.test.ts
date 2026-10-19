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
