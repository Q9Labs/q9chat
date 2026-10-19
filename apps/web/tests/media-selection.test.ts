import assert from "node:assert/strict";
import { test } from "node:test";

import { selectedMedia } from "../src/journey/media-selection.ts";

void test("a multi-photo selection closes each decode before starting the next", async (context) => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "createImageBitmap");
  context.after(() => {
    if (original) Object.defineProperty(globalThis, "createImageBitmap", original);
    else Reflect.deleteProperty(globalThis, "createImageBitmap");
  });
  let open = 0;
  let closed = 0;
  Object.defineProperty(globalThis, "createImageBitmap", {
    configurable: true,
    value: async () => {
      assert.equal(open, 0, "another decoded photo is still held");
      open += 1;
      await Promise.resolve();
      return {
        width: 4000,
        height: 3000,
        close() {
          open -= 1;
          closed += 1;
        },
      };
    },
  });
  const files = Array.from(
    { length: 10 },
    (_, index) => new File([new Uint8Array([0xff, 0xd8, 0xff])], `${index}.jpg`),
  );
  const selected = await selectedMedia(files, "photo");
  assert.deepEqual(
    selected.map((media) => media.blob),
    files,
  );
  assert.equal(closed, 10);
  assert.equal(open, 0);
});
