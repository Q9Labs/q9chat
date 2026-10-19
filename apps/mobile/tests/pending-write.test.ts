import assert from "node:assert/strict";
import { test } from "node:test";

import { createElement } from "react";
import { act, create } from "react-test-renderer";

import type { Phase } from "../src/journey/groupRules.ts";
import { createWriteRun, standOf } from "../src/journey/pendingWrite.ts";
import { type Removal, useGuardedWrite } from "../src/journey/useGuardedWrite.ts";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

void test("a screen with a write out stands on the connection: locked while it is up, waiting once it is down", () => {
  assert.equal(standOf(true, false), "ready");
  assert.equal(standOf(false, false), "offline");
  assert.equal(standOf(true, true), "locked");
  assert.equal(standOf(false, true), "waiting");
});

void test("a write that ends after an exit was acknowledged is stale, one that ends first is not", async () => {
  const writes = createWriteRun();
  const held = Promise.withResolvers<string>();
  const first = writes.run(() => held.promise);
  writes.supersede();
  held.resolve("late");
  assert.deepEqual(await first, { stale: true, ok: true, value: "late" });
  assert.deepEqual(await writes.run(() => Promise.resolve("now")), {
    stale: false,
    ok: true,
    value: "now",
  });
  const rejected = await writes.run(() => Promise.reject(new Error("no")));
  assert.equal(rejected.ok, false);
});

/** The navigation guard the router gives a screen: while enabled, a removal reaches the handler instead. */
function fakeGuard() {
  const guard: { enabled: boolean; handler: Removal | null } = { enabled: false, handler: null };
  return {
    /** What the screen hands the router's `usePreventRemove` on every render. */
    register: (enabled: boolean, handler: Removal) => {
      guard.enabled = enabled;
      guard.handler = handler;
    },
    /** Back, the swipe or Cancel: true when the screen was left. */
    attemptLeave: () => {
      if (!guard.enabled) return true;
      let left = false;
      act(() => guard.handler?.({ repeat: () => (left = true) }));
      return left;
    },
  };
}

/** A form with one write, as New group and Join use it: the real hook, a write the test settles, a screen change that counts. */
function mountForm(connected = true) {
  const nav = fakeGuard();
  const writes: { settle: (outcome: "ok" | Error) => void }[] = [];
  const navigated: string[] = [];
  const renders: ReturnType<typeof useGuardedWrite>[] = [];
  let props = { connected };
  function Form() {
    const guarded = useGuardedWrite(props.connected);
    nav.register(guarded.holding, guarded.onRemove);
    renders.push(guarded);
    return null;
  }
  let renderer: ReturnType<typeof create> | null = null;
  act(() => {
    renderer = create(createElement(Form));
  });
  const form = () => {
    const latest = renders.at(-1);
    if (!latest) throw new Error("the form did not render");
    return latest;
  };
  return {
    form,
    nav,
    navigated,
    writes,
    submit: () =>
      act(() =>
        form().submit(
          () =>
            new Promise((resolve, reject) => {
              writes.push({
                settle: (outcome) => (outcome === "ok" ? resolve("g1") : reject(outcome)),
              });
            }),
          (value) => navigated.push(String(value)),
          () => "Couldn't complete that.",
        ),
      ),
    settle: async (outcome: "ok" | Error) => {
      await act(async () => writes.at(-1)?.settle(outcome));
    },
    setConnected: (next: boolean) => {
      props = { connected: next };
      act(() => renderer?.update(createElement(Form)));
    },
  };
}

const kind = (phase: Phase) => phase.kind;

void test("offline before submitting: the form says so and sends nothing", () => {
  const screen = mountForm(false);
  screen.submit();
  assert.equal(screen.writes.length, 0);
  assert.equal(kind(screen.form().phase), "failed");
  const phase = screen.form().phase;
  assert.match(phase.kind === "failed" ? phase.message : "", /offline/iu);
});

void test("while the write is out and the connection is up, every way off the screen is held and nothing asks", () => {
  const screen = mountForm();
  screen.submit();
  assert.equal(kind(screen.form().phase), "pending");
  assert.equal(screen.nav.attemptLeave(), false);
  assert.equal(screen.form().prompt, null);
});

void test("connection lost while the write is out: leaving asks first, and an acknowledged exit never navigates when the write ends later", async () => {
  const screen = mountForm();
  screen.submit();
  screen.setConnected(false);
  assert.equal(screen.nav.attemptLeave(), false);
  const prompt = screen.form().prompt;
  assert.notEqual(prompt, null);
  act(() => prompt?.leave());
  assert.equal(screen.nav.attemptLeave(), true);
  await screen.settle("ok");
  assert.deepEqual(screen.navigated, []);
});

void test("staying after the question keeps the write alive: when it ends, the screen moves on", async () => {
  const screen = mountForm();
  screen.submit();
  screen.setConnected(false);
  screen.nav.attemptLeave();
  act(() => screen.form().prompt?.stay());
  assert.equal(screen.form().prompt, null);
  screen.setConnected(true);
  await screen.settle("ok");
  assert.deepEqual(screen.navigated, ["g1"]);
  assert.equal(screen.nav.attemptLeave(), true);
});

void test("a write that fails frees the form to try again", async () => {
  const screen = mountForm();
  screen.submit();
  await screen.settle(new Error("rejected"));
  assert.equal(screen.form().phase.kind, "failed");
  screen.submit();
  assert.equal(screen.writes.length, 2);
  assert.equal(kind(screen.form().phase), "pending");
});

void test("the connection coming back closes the question", () => {
  const screen = mountForm();
  screen.submit();
  screen.setConnected(false);
  screen.nav.attemptLeave();
  assert.notEqual(screen.form().prompt, null);
  screen.setConnected(true);
  assert.equal(screen.form().prompt, null);
});
