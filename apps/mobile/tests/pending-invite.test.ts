import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ATTEMPT_TTL_MS,
  readPendingInvite,
  writePendingInvite,
  type Store,
  type StoreKey,
} from "../src/session/storage.ts";

function memoryStore(initial: Partial<Record<StoreKey, string>> = {}) {
  const values = new Map<string, string>(Object.entries(initial));
  const store: Store = {
    get: async (key) => values.get(key) ?? null,
    set: async (key, value) => void values.set(key, value),
    delete: async (key) => void values.delete(key),
  };
  return { store, has: (key: StoreKey) => values.has(key) };
}

const TOKEN = "inviteFixtureToken";

void test("a saved invite comes back within ten minutes", async () => {
  const { store } = memoryStore();
  await writePendingInvite(store, TOKEN, 1_000);
  assert.equal(await readPendingInvite(store, 1_000 + ATTEMPT_TTL_MS - 1), TOKEN);
});

void test("an invite older than ten minutes is gone, and the record is deleted when it is met", async () => {
  const { store, has } = memoryStore();
  await writePendingInvite(store, TOKEN, 1_000);
  assert.equal(await readPendingInvite(store, 1_000 + ATTEMPT_TTL_MS), null);
  assert.equal(has("pendingInvite"), false);
});

void test("an unreadable or malformed record is deleted and gives no invite", async () => {
  for (const record of [
    "not json",
    JSON.stringify({ token: "short", expiresAt: Number.MAX_SAFE_INTEGER }),
    JSON.stringify({ token: TOKEN }),
  ]) {
    const { store, has } = memoryStore({ pendingInvite: record });
    assert.equal(await readPendingInvite(store, 0), null);
    assert.equal(has("pendingInvite"), false);
  }
});

void test("a newer invite replaces the older one", async () => {
  const { store } = memoryStore();
  await writePendingInvite(store, TOKEN, 0);
  await writePendingInvite(store, "z9Yx8wVu7tSr6qPo", 5);
  assert.equal(await readPendingInvite(store, 10), "z9Yx8wVu7tSr6qPo");
});
