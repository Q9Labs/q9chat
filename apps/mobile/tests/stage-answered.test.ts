import assert from "node:assert/strict";
import { mock, test } from "node:test";

import { createElement } from "react";
import { act, create } from "react-test-renderer";

import { GIVE_UP_MS, useStageAnswered } from "../src/journey/useStageAnswered.ts";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

/** The root layout's gate: what it asks, and the stage it is told. */
function mountGate(first: string) {
  mock.timers.enable({ apis: ["setTimeout"] });
  const seen: boolean[] = [];
  function Gate({ kind }: { kind: string }) {
    seen.push(useStageAnswered(kind));
    return null;
  }
  let renderer: ReturnType<typeof create> | null = null;
  act(() => {
    renderer = create(createElement(Gate, { kind: first }));
  });
  return {
    answered: () => seen.at(-1),
    stage: (kind: string) => act(() => renderer?.update(createElement(Gate, { kind }))),
    tick: (ms: number) => act(() => mock.timers.tick(ms)),
    done: () => mock.timers.reset(),
  };
}

void test("the router waits while the account is loading, and starts once it is known", () => {
  const gate = mountGate("loading");
  gate.tick(100);
  assert.equal(gate.answered(), false);
  gate.stage("ready");
  gate.tick(0);
  assert.equal(gate.answered(), true);
  gate.done();
});

void test("signed out is an answer too", () => {
  const gate = mountGate("loading");
  gate.stage("signedOut");
  gate.tick(0);
  assert.equal(gate.answered(), true);
  gate.done();
});

void test("once answered, a later refresh back to loading does not take the router away", () => {
  const gate = mountGate("ready");
  gate.tick(0);
  gate.stage("loading");
  gate.tick(GIVE_UP_MS);
  assert.equal(gate.answered(), true);
  gate.done();
});

void test("a restore that never answers is let through after a while", () => {
  const gate = mountGate("loading");
  gate.tick(GIVE_UP_MS - 1);
  assert.equal(gate.answered(), false);
  gate.tick(1);
  assert.equal(gate.answered(), true);
  gate.done();
});
