import assert from "node:assert/strict";
import { test } from "node:test";

import { initialRecording, recordingStep } from "../src/journey/recordingState.ts";

void test("a recording opens, becomes ready, finishes and closes", () => {
  const starting = recordingStep(initialRecording, { type: "open" });
  assert.equal(starting.phase, "starting");
  const ready = recordingStep(starting, { type: "ready", attempt: starting.attempt });
  assert.equal(ready.phase, "recording");
  const finishing = recordingStep(ready, { type: "finish", attempt: ready.attempt });
  assert.equal(finishing.phase, "finishing");
  assert.equal(
    recordingStep(finishing, { type: "stopped", attempt: finishing.attempt }).phase,
    "closed",
  );
});
void test("cancel closes each open phase and rejects every late native completion", () => {
  for (const phase of ["starting", "recording", "finishing", "failed"] as const) {
    const cancelled = recordingStep({ phase, attempt: 1 }, { type: "cancel" });
    assert.equal(cancelled.phase, "closed");
    for (const type of ["ready", "finish", "stopped", "failed"] as const)
      assert.deepEqual(recordingStep(cancelled, { type, attempt: 1 }), cancelled);
  }
});
void test("unavailable input stays open for retry or cancel, never ready to send", () => {
  const starting = recordingStep(initialRecording, { type: "open" });
  const failed = recordingStep(starting, { type: "failed", attempt: starting.attempt });
  assert.equal(failed.phase, "failed");
  assert.deepEqual(recordingStep(failed, { type: "finish", attempt: failed.attempt }), failed);
  const retry = recordingStep(failed, { type: "open" });
  assert.equal(retry.phase, "starting");
  assert.ok(retry.attempt > failed.attempt);
  assert.deepEqual(recordingStep(retry, { type: "ready", attempt: failed.attempt }), retry);
  assert.equal(recordingStep(retry, { type: "cancel" }).phase, "closed");
});
void test("duplicate starts and finishing before readiness do not change state", () => {
  const starting = recordingStep(initialRecording, { type: "open" });
  assert.deepEqual(recordingStep(starting, { type: "open" }), starting);
  assert.deepEqual(
    recordingStep(starting, { type: "finish", attempt: starting.attempt }),
    starting,
  );
  assert.deepEqual(initialRecording, { phase: "closed", attempt: 0 });
});

void test("the permission dialog does not cancel preparation", () => {
  const starting = recordingStep(initialRecording, { type: "open" });
  const interrupted = recordingStep(starting, { type: "interrupt" });
  assert.deepEqual(interrupted, starting);
  assert.equal(
    recordingStep(interrupted, { type: "ready", attempt: starting.attempt }).phase,
    "recording",
  );
});
void test("leaving the app cancels capture but not a preparation or stop in progress", () => {
  for (const phase of ["closed", "starting", "recording", "finishing", "failed"] as const) {
    const before = { phase, attempt: 3 };
    const after = recordingStep(before, { type: "interrupt" });
    if (phase === "recording") {
      assert.deepEqual(after, { phase: "closed", attempt: 4 });
      assert.deepEqual(recordingStep(after, { type: "ready", attempt: 3 }), after);
    } else assert.deepEqual(after, before);
  }
});
