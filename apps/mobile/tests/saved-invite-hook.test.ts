import assert from "node:assert/strict";
import { test } from "node:test";

import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

import { useSavedInvite } from "../src/journey/useSavedInvite.ts";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const FIRST = "firstFixtureToken1";
const SECOND = "secondFixtureToken";

/** The part of the session the route uses, recording which invites it was told to forget. */
function fakeSession(fails = false) {
  const forgotten: string[] = [];
  return {
    forgotten,
    session: {
      forgetInvite: (token: string) => {
        forgotten.push(token);
        return fails ? Promise.reject(new Error("keychain write failed")) : Promise.resolve();
      },
    },
  };
}

/** The join route as the app mounts it: it learns whether sign-in is done, and it can be left. */
function joinRoute(session: ReturnType<typeof fakeSession>["session"], invite: string) {
  function Route({ ready }: { ready: boolean }) {
    useSavedInvite(invite, ready, session);
    return null;
  }
  let renderer: ReactTestRenderer | null = null;
  act(() => {
    renderer = create(createElement(Route, { ready: false }));
  });
  return {
    signedIn: () => act(() => renderer?.update(createElement(Route, { ready: true }))),
    leave: () => act(() => renderer?.unmount()),
  };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 10));

void test("a route that is on screen keeps its invite", () => {
  const { forgotten, session } = fakeSession();
  joinRoute(session, FIRST);
  assert.deepEqual(forgotten, []);
});

void test("leaving the join route by Back or the gesture forgets its invite", () => {
  const { forgotten, session } = fakeSession();
  joinRoute(session, FIRST).leave();
  assert.deepEqual(forgotten, [FIRST]);
});

void test("signing in on the join route forgets the invite: from then on the route holds the token", () => {
  const { forgotten, session } = fakeSession();
  joinRoute(session, FIRST).signedIn();
  assert.deepEqual(forgotten, [FIRST]);
});

void test("an older route leaving forgets only its own invite", () => {
  const { forgotten, session } = fakeSession();
  const older = joinRoute(session, FIRST);
  joinRoute(session, SECOND);
  older.leave();
  assert.deepEqual(forgotten, [FIRST]);
});

void test("a forget that fails does not break the screen that is going away", async () => {
  const { forgotten, session } = fakeSession(true);
  joinRoute(session, FIRST).leave();
  await settle();
  assert.deepEqual(forgotten, [FIRST]);
});
