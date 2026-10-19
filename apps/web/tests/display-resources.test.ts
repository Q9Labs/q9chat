import assert from "node:assert/strict";
import test from "node:test";

import { DisplayResources } from "../src/journey/display-resources.ts";

await test("mounted consumers keep more than eight photos until their final release", () => {
  const resources = new DisplayResources();
  for (let index = 0; index < 10; index++) {
    const path = `photo-${index}`;
    resources.retain(path);
    assert.deepEqual(resources.add(path, { url: `blob:${path}`, bytes: 5_000_000 }), []);
  }
  assert.equal(resources.urls().size, 10);
  resources.retain("photo-0");
  assert.equal(resources.release("photo-0"), null);
  assert.equal(resources.get("photo-0"), "blob:photo-0");
  assert.equal(resources.release("photo-0"), "blob:photo-0");
  assert.equal(resources.get("photo-0"), undefined);
  resources.add("idle", { url: "blob:idle", bytes: 1 });
  assert.deepEqual(resources.add("next", { url: "blob:next", bytes: 1 }), ["blob:idle"]);
  assert.equal(resources.get("photo-9"), "blob:photo-9");
  assert.equal(resources.clear().length, 10);
  assert.equal(resources.urls().size, 0);
});
