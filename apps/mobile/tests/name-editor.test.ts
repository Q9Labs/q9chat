import assert from "node:assert/strict";
import { test } from "node:test";

import { createNameEditor } from "../src/journey/nameEditor.ts";

/** An editor with a saved name that can change, a connection that can drop, and saves the test settles. */
function setup(initial = "Nadia") {
  const saves: { name: string; settle: (outcome: "ok" | Error) => void }[] = [];
  const inputs = {
    saved: initial,
    connected: true,
    photoBusy: false,
    save: (name: string) =>
      new Promise((resolve, reject) => {
        saves.push({
          name,
          settle: (outcome) => (outcome === "ok" ? resolve(null) : reject(outcome)),
        });
      }),
  };
  const editor = createNameEditor(inputs);
  // The screen hands the editor the latest values on every render; the test does it on every change.
  const world = {
    set saved(name: string) {
      inputs.saved = name;
      editor.sync(inputs);
    },
    set connected(up: boolean) {
      inputs.connected = up;
      editor.sync(inputs);
    },
    set photoBusy(busy: boolean) {
      inputs.photoBusy = busy;
      editor.sync(inputs);
    },
  };
  const left: string[] = [];
  const leave = (where: string) => () => {
    left.push(where);
  };
  return { world, saves, editor, left, leave };
}

const tick = () => new Promise((resolve) => setImmediate(resolve));

void test("a clean editor never saves: the profile name changes live, then Sign out leaves without a write", async () => {
  const { world, saves, editor, left, leave } = setup("Nadia");
  world.saved = "Nadia Journey";
  await editor.exit(leave("sign out"));
  assert.deepEqual(left, ["sign out"]);
  assert.equal(saves.length, 0);
});

void test("a field set back to the saved name is clean too", async () => {
  const { saves, editor, left, leave } = setup("Nadia");
  editor.change("Nadia 2");
  editor.change(" Nadia ");
  await editor.exit(leave("back"));
  assert.deepEqual(left, ["back"]);
  assert.equal(saves.length, 0);
});

void test("a changed name is saved first, locks the field meanwhile, and leaves once it is saved", async () => {
  const { saves, editor, left, leave } = setup();
  editor.change("Nadia Jo");
  const leaving = editor.exit(leave("back"));
  await tick();
  assert.equal(editor.snapshot().saving, true);
  assert.deepEqual(
    saves.map((save) => save.name),
    ["Nadia Jo"],
  );
  assert.deepEqual(left, []);

  saves[0]?.settle("ok");
  await leaving;
  assert.deepEqual(left, ["back"]);
  assert.equal(editor.snapshot().saving, false);
});

void test("a second exit while the save is out and the connection is up waits for the first", async () => {
  const { saves, editor, left, leave } = setup();
  editor.change("Nadia Jo");
  const first = editor.exit(leave("sign out"));
  await tick();
  await editor.exit(leave("sign out again"));
  assert.equal(saves.length, 1);
  assert.equal(editor.snapshot().unsaved, null);

  saves[0]?.settle("ok");
  await first;
  assert.deepEqual(left, ["sign out"]);
});

void test("offline before saving: Back and Sign out show the choice and submit nothing", async () => {
  const { world, saves, editor, left, leave } = setup();
  world.connected = false;
  editor.change("Nadia Jo");

  await editor.exit(leave("back"));
  assert.equal(saves.length, 0);
  assert.equal(editor.snapshot().unsaved?.confirmLabel, "Discard changes");
  assert.equal(editor.snapshot().unsaved?.cancelLabel, "Keep editing");

  editor.keepEditing();
  assert.equal(editor.snapshot().unsaved, null);
  assert.equal(editor.snapshot().draft, "Nadia Jo");
  assert.deepEqual(left, []);

  await editor.exit(leave("sign out"));
  editor.discard();
  assert.deepEqual(left, ["sign out"]);
  assert.equal(editor.snapshot().draft, null);
  assert.equal(saves.length, 0);
});

void test("the connection drops during a save: the next Back or Sign out offers a way out, and a late save leaves nothing behind", async () => {
  const { world, saves, editor, left, leave } = setup();
  editor.change("Nadia Jo");
  const back = editor.exit(leave("back"));
  await tick();
  world.connected = false;

  await editor.exit(leave("sign out"));
  assert.equal(editor.snapshot().unsaved?.confirmLabel, "Leave anyway");
  assert.equal(saves.length, 1);

  editor.discard();
  assert.deepEqual(left, ["sign out"]);
  assert.equal(editor.snapshot().draft, null);

  // The connection returns and the queued write goes through: the older Back must not navigate now.
  world.connected = true;
  saves[0]?.settle("ok");
  await back;
  assert.deepEqual(left, ["sign out"]);
  assert.equal(editor.snapshot().unsaved, null);
});

void test("staying on Account after the offer also cancels the older exit", async () => {
  const { world, saves, editor, left, leave } = setup();
  editor.change("Nadia Jo");
  const back = editor.exit(leave("back"));
  await tick();
  world.connected = false;
  await editor.exit(leave("sign out"));

  editor.keepEditing();
  world.connected = true;
  saves[0]?.settle("ok");
  await back;
  assert.deepEqual(left, []);
  assert.equal(editor.snapshot().saving, false);
});

void test("a rejected save and an invalid name both ask, and discard leaves", async () => {
  const { saves, editor, left, leave } = setup();
  editor.change("Nadia Jo");
  const failing = editor.exit(leave("back"));
  await tick();
  saves[0]?.settle(new Error("rejected"));
  await failing;
  assert.deepEqual(left, []);
  assert.match(editor.snapshot().unsaved?.text ?? "", /Couldn't save/u);
  editor.keepEditing();

  editor.change("   ");
  await editor.exit(leave("back"));
  assert.match(editor.snapshot().unsaved?.text ?? "", /1 to 60/u);
  editor.discard();
  assert.deepEqual(left, ["back"]);
  assert.equal(saves.length, 1);
});

void test("a change typed while the save was out keeps the screen and is not saved by that exit", async () => {
  const { saves, editor, left, leave } = setup();
  editor.change("Nadia Jo");
  const leaving = editor.exit(leave("back"));
  await tick();
  editor.change("Nadia Jones");
  saves[0]?.settle("ok");
  await leaving;
  assert.deepEqual(left, []);
  assert.equal(editor.snapshot().draft, "Nadia Jones");
});

void test("a photo change that has not finished asks before leaving, and Stay here keeps the screen", async () => {
  const { world, editor, left, leave } = setup();
  world.photoBusy = true;
  await editor.exit(leave("back"));
  assert.deepEqual(left, []);
  assert.equal(editor.snapshot().unsaved?.title, "Your photo isn't saved");
  assert.equal(editor.snapshot().unsaved?.confirmLabel, "Leave anyway");
  editor.keepEditing();
  assert.deepEqual(left, []);

  world.photoBusy = false;
  await editor.exit(leave("back"));
  assert.deepEqual(left, ["back"]);
});

void test("Leave anyway lets go of a photo change that has not finished", async () => {
  const { world, editor, left, leave } = setup();
  world.photoBusy = true;
  await editor.exit(leave("sign out"));
  editor.discard();
  assert.deepEqual(left, ["sign out"]);
});

void test("a saved name still asks about the photo change before leaving", async () => {
  const { world, editor, saves, left, leave } = setup();
  editor.change("Nadia Jo");
  world.photoBusy = true;
  const exiting = editor.exit(leave("back"));
  await tick();
  saves[0]?.settle("ok");
  await exiting;
  assert.deepEqual(left, []);
  assert.equal(editor.snapshot().unsaved?.cancelLabel, "Stay here");
});

void test("discarding the name still asks about a pending photo change before signing out", async () => {
  const { world, editor, left, leave } = setup();
  editor.change("Nadia Jo");
  world.connected = false;
  world.photoBusy = true;
  await editor.exit(leave("sign out"));
  assert.equal(editor.snapshot().unsaved?.title, "Your name isn't saved");

  editor.discard();
  assert.deepEqual(left, []);
  assert.equal(editor.snapshot().unsaved?.title, "Your photo isn't saved");
  assert.equal(editor.snapshot().draft, null);

  editor.discard();
  assert.deepEqual(left, ["sign out"]);
});
