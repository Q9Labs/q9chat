import assert from "node:assert/strict";
import { test } from "node:test";

import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

import { useSavedInvite } from "../src/journey/useSavedInvite.ts";
import type { Store, StoreKey } from "../src/session/storage.ts";

process.env["EXPO_PUBLIC_CONVEX_URL"] = "https://example.convex.cloud";
process.env["EXPO_PUBLIC_AUTH_ORIGIN"] = "http://worker.test";
process.env["EXPO_PUBLIC_WORKOS_CLIENT_ID"] = "client_test";
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const { createSessionClient } = await import("../src/session/core.ts");

const FIRST = "firstFixtureToken1";
const SECOND = "secondFixtureToken";

/** The real session client on a keychain that outlives it, like the phone's. */
function phone() {
  const values = new Map<string, string>();
  const store: Store = {
    get: async (key: StoreKey) => values.get(key) ?? null,
    set: async (key, value) => void values.set(key, value),
    delete: async (key) => void values.delete(key),
  };
  const open = () =>
    createSessionClient({
      store,
      openAuth: () => Promise.resolve({ type: "closed" }),
      randomBytes: () => new Uint8Array(32),
      sha256Base64: async () => "",
      now: () => Date.now(),
    });
  return { saved: () => values.get("pendingInvite") ?? null, open };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 10));

/** The join route as the app mounts it: it learns whether sign-in is done, and it can be left. */
function joinRoute(
  client: ReturnType<ReturnType<typeof phone>["open"]>,
  invite: string,
  ready = false,
) {
  function Route({ ready: isReady }: { ready: boolean }) {
    useSavedInvite(invite, isReady, client);
    return null;
  }
  let renderer: ReactTestRenderer | null = null;
  act(() => {
    renderer = create(createElement(Route, { ready }));
  });
  return {
    signedIn: () => act(() => renderer?.update(createElement(Route, { ready: true }))),
    leave: () => act(() => renderer?.unmount()),
  };
}

void test("leaving the join route by Back or the gesture drops the invite, so an ordinary sign-in gets nothing", async () => {
  const { saved, open } = phone();
  const client = open();
  const route = joinRoute(client, FIRST);
  await settle();
  assert.equal(saved() === null, false);
  route.leave();
  await settle();
  assert.equal(saved(), null);
  assert.equal(await client.takeInvite(), null);
});

void test("signing in on the join route spends the saved invite", async () => {
  const { saved, open } = phone();
  const route = joinRoute(open(), FIRST);
  await settle();
  route.signedIn();
  await settle();
  assert.equal(saved(), null);
});

void test("a killed app keeps the invite for the next sign-in, once", async () => {
  const { saved, open } = phone();
  joinRoute(open(), FIRST);
  await settle();
  // No leave: the process died with the route on screen.
  const restarted = open();
  assert.equal(saved() === null, false);
  assert.equal(await restarted.takeInvite(), FIRST);
  assert.equal(await restarted.takeInvite(), null);
});

void test("an older route leaving never drops the invite of a newer one", async () => {
  const { open } = phone();
  const client = open();
  const older = joinRoute(client, FIRST);
  await settle();
  joinRoute(client, SECOND);
  await settle();
  older.leave();
  await settle();
  assert.equal(await client.takeInvite(), SECOND);
});

void test("a signed-in person opening a link never saves it", async () => {
  const { saved, open } = phone();
  joinRoute(open(), FIRST, true);
  await settle();
  assert.equal(saved(), null);
});
