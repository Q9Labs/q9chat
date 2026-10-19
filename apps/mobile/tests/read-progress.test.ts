import assert from "node:assert/strict";
import test from "node:test";

import {
  type ReadProgress,
  observeReadProgress,
  flushReadProgress,
} from "../src/journey/readProgress.ts";

function readProgress(initial: number): ReadProgress {
  return { seen: initial, saved: initial, connected: false, saving: false };
}

void test("offline progress keeps the furthest seen post after scrolling back", async () => {
  const progress = readProgress(90);
  const saved: number[] = [];
  observeReadProgress(progress, 120, true);
  observeReadProgress(progress, 100, true);
  assert.equal(
    flushReadProgress(progress, async (sequence) => {
      saved.push(sequence);
    }),
    null,
  );
  progress.connected = true;
  await flushReadProgress(progress, async (sequence) => {
    saved.push(sequence);
  });
  assert.deepEqual(saved, [120]);
});

void test("in-flight saves coalesce eligible observations and drain after the reader leaves", async () => {
  const progress = readProgress(90);
  progress.connected = true;
  const { promise: pending, resolve: release } = Promise.withResolvers<void>();
  const saved: number[] = [];
  observeReadProgress(progress, 100, true);
  const saving = flushReadProgress(progress, async (sequence) => {
    saved.push(sequence);
    if (sequence === 100) await pending;
  });
  observeReadProgress(progress, 120, true);
  observeReadProgress(progress, 150, true);
  observeReadProgress(progress, 110, true);
  observeReadProgress(progress, 200, false);
  assert.equal(
    flushReadProgress(progress, async () => assert.fail("duplicate save")),
    null,
  );
  release();
  await saving;
  assert.deepEqual(saved, [100, 150]);
  assert.equal(progress.saved, 150);
});

void test("covered and background history never create observations", async () => {
  const progress = readProgress(90);
  progress.connected = true;
  observeReadProgress(progress, 120, false);
  observeReadProgress(progress, 150, false);
  assert.equal(
    flushReadProgress(progress, async () => assert.fail("unseen post")),
    null,
  );
  assert.equal(progress.seen, 90);
});

void test("a failed save retains progress observed before retry", async () => {
  const progress = readProgress(90);
  progress.connected = true;
  observeReadProgress(progress, 100, true);
  const saving = flushReadProgress(progress, async () => {
    throw new Error("offline");
  });
  assert.ok(saving);
  await assert.rejects(saving);
  observeReadProgress(progress, 140, true);
  observeReadProgress(progress, 110, true);
  const saved: number[] = [];
  await flushReadProgress(progress, async (sequence) => {
    saved.push(sequence);
  });
  assert.deepEqual(saved, [140]);
});

void test("disconnect during a save retains the pending maximum until reconnect", async () => {
  const progress = readProgress(90);
  progress.connected = true;
  observeReadProgress(progress, 100, true);
  const saved: number[] = [];
  await flushReadProgress(progress, async (sequence) => {
    saved.push(sequence);
    progress.connected = false;
    observeReadProgress(progress, 120, true);
  });
  assert.equal(progress.saved, 100);
  progress.connected = true;
  await flushReadProgress(progress, async (sequence) => {
    saved.push(sequence);
  });
  assert.deepEqual(saved, [100, 120]);
});
