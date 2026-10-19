import assert from "node:assert/strict";
import { test } from "node:test";

import { createTextStores } from "../src/journey/textStores.ts";

function memoryStorage() {
  const files = new Map<string, string>();
  return {
    files,
    file: (name: string) => ({
      get exists() {
        return files.has(name);
      },
      textSync: () => files.get(name) ?? "",
      writeSync: (text: string) => {
        files.set(name, text);
      },
      delete: () => {
        files.delete(name);
      },
    }),
    names: () => [...files.keys()],
  };
}
const saved = {
  draft: "private draft",
  pending: [{ clientKey: "failed", body: "private send", createdAt: 1, status: "failed" }],
} as const;

void test("sign-out erases open and unopened stores and retires outstanding callbacks", () => {
  const storage = memoryStorage();
  const firstProcess = createTextStores(storage);
  firstProcess.textStore("other", "one").update(saved);
  firstProcess.textStore("me", "unopened").update(saved);
  const currentProcess = createTextStores(storage);
  const open = currentProcess.textStore("me", "open");
  open.update(saved);
  currentProcess.clearAccountText();
  assert.deepEqual(open.get(), { draft: "", pending: [], error: "" });
  assert.equal(open.update(saved), false);
  open.error("late send failed");
  assert.deepEqual(open.get(), { draft: "", pending: [], error: "" });
  assert.deepEqual([...storage.files.keys()], ["q9-text-other-one.json"]);
  const restarted = createTextStores(storage);
  assert.equal(restarted.textStore("me", "unopened").get().draft, "");
  assert.deepEqual(restarted.textStore("me", "open").get().pending, []);
  assert.deepEqual(restarted.textStore("other", "one").get().pending, saved.pending);
});

void test("offline sign-out after restart needs no open store or backend query", () => {
  const storage = memoryStorage();
  const beforeRestart = createTextStores(storage);
  beforeRestart.textStore("me", "one").update(saved);
  const afterRestart = createTextStores(storage);
  afterRestart.clearAccountText();
  assert.equal(storage.files.size, 0);
  afterRestart.clearAccountText();
  assert.equal(storage.files.size, 0);
});

void test("removal clears only that profile's group, on disk and in the cache", () => {
  const storage = memoryStorage();
  const registry = createTextStores(storage);
  registry.textStore("other", "removed").update(saved);
  registry.textStore("me", "kept").update(saved);
  const removed = registry.textStore("me", "removed");
  removed.update(saved);
  registry.clearGroupText("me", "removed");
  assert.equal(storage.files.has("q9-text-me-removed.json"), false);
  assert.equal(removed.update(saved), false);
  assert.deepEqual(registry.textStore("me", "removed").get(), {
    draft: "",
    pending: [],
    error: "",
  });
  assert.equal(registry.textStore("me", "kept").get().draft, "private draft");
  assert.equal(registry.textStore("other", "removed").get().draft, "private draft");
});
