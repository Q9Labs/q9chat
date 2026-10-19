import assert from "node:assert/strict";
import { test } from "node:test";

import { createMediaCache } from "../src/kit/mediaCache.ts";

function harness() {
  const files = new Map<string, string>();
  const cache = createMediaCache({
    names: () => [...files.keys()],
    remove: (name) => {
      files.delete(name);
    },
  });
  const write = async (directory: string) => {
    files.set(directory, "private bytes");
    return `${directory}/voice.m4a`;
  };
  return { cache, files, write };
}

for (const end of ["leave", "removal", "sign-out"] as const) {
  void test(`${end} erases owned bytes and retires completed and outstanding downloads`, async () => {
    const { cache, files, write } = harness();
    const removed = cache.open("me", "removed");
    const retained = cache.open("me", "retained");
    const old = await removed.download("old", write);
    const keep = await retained.download("keep", write);
    const finished = Promise.withResolvers<void>();
    const downloading = removed.download("late", async (directory) => {
      await finished.promise;
      return write(directory);
    });
    // A previous process's copy and the old unscoped cache must also be erased.
    files.set("q9-media-me-removed-unopened", "private bytes");
    files.set("q9-share-legacy", "private bytes");
    files.set("user-export", "explicit export");
    if (end === "leave") cache.clearGroup("me", "removed");
    else if (end === "removal") cache.retainGroups("me", ["retained"]);
    else cache.clearAccount();
    assert.throws(old.assertActive);
    assert.equal(files.has("q9-media-me-removed-old"), false);
    assert.equal(files.has("q9-media-me-removed-unopened"), false);
    assert.equal(files.has("q9-share-legacy"), false);
    assert.equal(files.has("user-export"), true);
    if (end === "sign-out") {
      assert.throws(keep.assertActive);
      assert.equal(files.has("q9-media-me-retained-keep"), false);
    } else {
      assert.doesNotThrow(keep.assertActive);
      assert.equal(files.has("q9-media-me-retained-keep"), true);
    }
    finished.resolve();
    await assert.rejects(downloading, /no longer available/u);
    assert.equal(files.has("q9-media-me-removed-late"), false);
    await assert.rejects(removed.download("again", write));
  });
}

void test("a failed download removes its partial private bytes", async () => {
  const { cache, files } = harness();
  await assert.rejects(
    cache.open("me", "group").download("failed", async (directory) => {
      files.set(directory, "partial bytes");
      throw new Error("network failed");
    }),
  );
  assert.equal(files.size, 0);
});
