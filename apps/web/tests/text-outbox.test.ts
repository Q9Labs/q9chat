import assert from "node:assert/strict";
import { test } from "node:test";

import { loadText } from "../src/journey/text-storage.ts";

class DeviceStorage {
  getItem(key: string): string | null {
    const value: unknown = Reflect.get(this, key);
    return typeof value === "string" ? value : null;
  }
  setItem(key: string, value: string) {
    if (key.includes(":quarantine:"))
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    Reflect.set(this, key, value);
  }
  removeItem(key: string) {
    Reflect.deleteProperty(this, key);
  }
}

void test("a full quarantine preserves the draft and valid retries and removes the poisoned key", () => {
  const local = new DeviceStorage();
  const session = new DeviceStorage();
  const previousLocal = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const previousSession = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
  const key = "text:account:group";
  session.setItem(`${key}:draft`, "Newer unsent draft");
  const first = {
    clientKey: "first",
    body: "First retry",
    createdAt: 1,
    status: "sending",
    reply: {
      id: "original",
      sequence: 12,
      summary: "Original plan",
      author: { id: "peer", name: "Bilal", isYou: false },
    },
  };
  const second = { clientKey: "second", body: "Second retry", createdAt: 2, status: "failed" };
  local.setItem(`${key}:pending:first`, JSON.stringify(first));
  local.setItem(`${key}:pending:broken`, "{broken");
  local.setItem(`${key}:pending:second`, JSON.stringify(second));
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: local });
  Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: session });
  try {
    const restored = loadText(key);
    assert.equal(restored.text.draft, "Newer unsent draft");
    assert.deepEqual(restored.text.pending, [{ ...first, status: "failed" }, second]);
    assert.equal(local.getItem(`${key}:pending:broken`), null);
    assert.equal(restored.error, "Couldn't restore one or more unsent messages on this device.");
    assert.deepEqual(loadText(key), { text: restored.text, error: "" });
  } finally {
    if (previousLocal) Object.defineProperty(globalThis, "localStorage", previousLocal);
    else Reflect.deleteProperty(globalThis, "localStorage");
    if (previousSession) Object.defineProperty(globalThis, "sessionStorage", previousSession);
    else Reflect.deleteProperty(globalThis, "sessionStorage");
  }
});
