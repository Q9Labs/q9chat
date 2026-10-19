import assert from "node:assert/strict";
import { test } from "node:test";

import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

import { useNameEditing } from "../src/journey/useNameEditing.ts";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

type Editing = ReturnType<typeof useNameEditing>;

/** Account's name field as the screen uses it: the real hook, a save the test settles, and a back that counts. */
function mountAccount(initial = { saved: "Nadia", connected: true }) {
  const saves: { name: string; settle: (outcome: "ok" | Error) => void }[] = [];
  const left: string[] = [];
  const renders: Editing[] = [];
  let props = initial;
  function Account() {
    renders.push(
      useNameEditing({
        ...props,
        photoBusy: false,
        save: (name) =>
          new Promise((resolve, reject) => {
            saves.push({
              name,
              settle: (outcome) => (outcome === "ok" ? resolve(null) : reject(outcome)),
            });
          }),
      }),
    );
    return null;
  }
  let renderer: ReactTestRenderer | null = null;
  act(() => {
    renderer = create(createElement(Account));
  });
  const screen = () => {
    const latest = renders.at(-1);
    if (!latest) throw new Error("Account did not render");
    return latest;
  };
  return {
    screen,
    saves,
    left,
    // The navigation callback `usePreventRemove` hands the screen when Back is pressed.
    back: () => {
      let leaving: Promise<void> = Promise.resolve();
      act(() => {
        leaving = screen().exit(() => left.push("back"));
      });
      return leaving;
    },
    type: (name: string) => {
      act(() => screen().change(name));
    },
    reconnect: (connected: boolean) => {
      props = { ...props, connected };
      act(() => renderer?.update(createElement(Account)));
    },
  };
}

void test("Back with a changed name waits for the save, and only leaves once the save lands", async () => {
  const account = mountAccount();
  account.type("Nadia B");
  assert.equal(account.screen().dirty, true);

  const leaving = account.back();
  assert.equal(account.screen().saving, true);
  assert.deepEqual(
    account.saves.map((save) => save.name),
    ["Nadia B"],
  );
  assert.deepEqual(account.left, [], "the screen holds while the save is out");

  await act(async () => {
    account.saves[0]?.settle("ok");
    await leaving;
  });
  assert.deepEqual(account.left, ["back"]);
  assert.equal(account.screen().saving, false);
});

void test("a save that is rejected keeps the screen and asks what to do", async () => {
  const account = mountAccount();
  account.type("Nadia B");
  const leaving = account.back();
  await act(async () => {
    account.saves[0]?.settle(new Error("rejected"));
    await leaving;
  });
  assert.deepEqual(account.left, []);
  assert.equal(account.screen().unsaved?.confirmLabel, "Discard changes");
});

void test("Back while offline asks first and sends nothing; after reconnecting, Back saves", async () => {
  const account = mountAccount({ saved: "Nadia", connected: false });
  account.type("Nadia B");
  await act(() => account.back());
  assert.deepEqual(account.left, []);
  assert.equal(account.saves.length, 0);
  assert.equal(account.screen().unsaved?.cancelLabel, "Keep editing");

  act(() => account.screen().keepEditing());
  account.reconnect(true);
  void account.back();
  assert.deepEqual(
    account.saves.map((save) => save.name),
    ["Nadia B"],
  );
});
