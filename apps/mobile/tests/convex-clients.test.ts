import assert from "node:assert/strict";
import { test } from "node:test";

import { ConvexReactClient } from "convex/react";
import { makeFunctionReference } from "convex/server";
import { createElement } from "react";
import { act, create } from "react-test-renderer";

import { createClientHolder, useEpochClient } from "../src/session/convexClients.ts";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

/** A socket that never reaches a server: the test decides when the "network" comes back. */
class FakeSocket {
  static readonly all: FakeSocket[] = [];
  readonly sent: string[] = [];
  readyState = 0;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: (() => void) | null = null;
  readonly url: string;
  constructor(url: string) {
    this.url = url;
    FakeSocket.all.push(this);
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.readyState = 3;
    setImmediate(() => this.onclose?.());
  }
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
}

const saveName = makeFunctionReference<"mutation", { displayName: string }>("profiles:update");

const newClient = () =>
  new ConvexReactClient("https://example.convex.cloud", {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Convex calls only the few members the fake has
    webSocketConstructor: FakeSocket as unknown as typeof WebSocket,
    unsavedChangesWarning: false,
  });

/** The connection comes back for every socket that is still alive. */
const networkReturns = async () => {
  for (const socket of FakeSocket.all) if (socket.readyState === 0) socket.open();
  await new Promise((resolve) => setTimeout(resolve, 50));
};

const mutationsSent = () =>
  FakeSocket.all.flatMap((socket) => socket.sent).filter((frame) => frame.includes('"Mutation"'));

void test("a name saved offline by one account is not sent when the next account signs in", async () => {
  const clients = createClientHolder(newClient);
  const accountA = clients.clientFor(0);
  void accountA.mutation(saveName, { displayName: "Name of A" }).catch(() => {});

  // A signs out, B signs in: the provider hands out a new client and closes the old one after React is done.
  const accountB = clients.clientFor(1);
  clients.closeRetired();
  await networkReturns();
  void accountB.mutation(saveName, { displayName: "Name of B" }).catch(() => {});
  await networkReturns();

  const sent = mutationsSent();
  assert.equal(sent.length, 1, "only B's own save goes out");
  assert.match(sent[0] ?? "", /Name of B/u);
  assert.equal(
    sent.some((frame) => frame.includes("Name of A")),
    false,
  );
  await accountB.close();
});

/** The session as the provider sees it: an epoch that moves when an account ends its session. */
function fakeSession() {
  let epoch = 0;
  const listeners = new Set<() => void>();
  return {
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    epoch: () => epoch,
    endSession: () => {
      epoch += 1;
      for (const listener of listeners) listener();
    },
  };
}

void test("the provider's hook gives each session its own client and closes the old one, so A's offline save never reaches B", async () => {
  const session = fakeSession();
  const clients = createClientHolder(newClient);
  const seen: ReturnType<typeof newClient>[] = [];
  function Provider() {
    seen.push(useEpochClient(session, clients));
    return null;
  }
  let renderer: ReturnType<typeof create> | null = null;
  act(() => {
    renderer = create(createElement(Provider));
  });
  const accountA = seen.at(-1);
  void accountA?.mutation(saveName, { displayName: "Provider A" }).catch(() => {});

  act(() => session.endSession());
  const accountB = seen.at(-1);
  assert.notEqual(accountB, accountA);
  await networkReturns();
  void accountB?.mutation(saveName, { displayName: "Provider B" }).catch(() => {});
  await networkReturns();

  const sent = mutationsSent();
  assert.equal(
    sent.some((frame) => frame.includes("Provider A")),
    false,
  );
  assert.equal(sent.filter((frame) => frame.includes("Provider B")).length, 1);
  act(() => renderer?.unmount());
  await accountB?.close();
});
