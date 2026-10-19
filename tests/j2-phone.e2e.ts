import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { test } from "@e2e-dev/mobile";
import type { Locator } from "e2e";

import { type J2Platform, runHeicPhoto, runJ2 } from "./support/j2-flow.js";
import { PHOTO_JPEG } from "./support/photo.js";

// Journey 2 on the phone, iOS simulator edition. Runs against dev Convex and the web Worker on
// http://localhost:3000, on the simulator named by J1_PHONE_UDID.

const udid = (() => {
  const named = process.env["J1_PHONE_UDID"];
  if (!named)
    throw new Error("J1_PHONE_UDID must name the simulator the dev client is installed on");
  return named;
})();

type Fixtures = Parameters<Parameters<typeof test>[2]>[0];

// A plain fill reads the field back before the controlled input has re-rendered and fails on identical text,
// so the text goes in key by key.
async function enter(field: Locator, text: string) {
  await field.fill("");
  if (text) await field.pressSequentially(text, { delay: 80 });
}

async function startClean({ app, device }: Fixtures) {
  // A system sheet from an earlier run lingers after it closes and hides the next one from the accessibility tree.
  for (const bundleId of ["com.apple.PhotosViewService", "com.apple.SafariViewService"])
    spawnSync("xcrun", ["simctl", "terminate", udid, bundleId], { stdio: "ignore" });
  await device.clearKeychain();
  await app.open();
}

function iosPlatform({ app, device, screen }: Fixtures): J2Platform {
  return {
    screen,
    target: 44,
    shot: async (name) => {
      await app.screenshot(name);
    },
    enter,
    enterCode: async (digits) => {
      await screen.getByLabel("6-digit code").pressSequentially(digits, { delay: 80 });
    },
    restart: () => app.restart(),
    openLink: async (url) => {
      await device.openLink(url);
      // The system asks before it opens the app from a link, and only the first time for a link of this kind.
      const open = screen.getByRole("button", "Open", { exact: true });
      for (let attempt = 0; attempt < 10; attempt += 1) {
        if (await open.isVisible()) {
          await open.tap();
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    },
    systemBack: null,
  };
}

test(
  "J2: create, add and join by link",
  { timeout: 900_000, platforms: ["ios"] },
  async (fixtures) => {
    await startClean(fixtures);
    await runJ2(iosPlatform(fixtures));
  },
);

test(
  "a HEIC photo from the library is uploaded as a JPEG",
  { timeout: 300_000, platforms: ["ios"] },
  async (fixtures) => {
    await startClean(fixtures);
    await runHeicPhoto(iosPlatform(fixtures), () => {
      const dir = mkdtempSync(join(tmpdir(), "q9-j2-heic-"));
      writeFileSync(join(dir, "photo.jpg"), Buffer.from(PHOTO_JPEG, "base64"));
      execFileSync(
        "sips",
        ["-s", "format", "heic", join(dir, "photo.jpg"), "--out", join(dir, "photo.heic")],
        {
          stdio: "ignore",
        },
      );
      execFileSync("xcrun", ["simctl", "addmedia", udid, join(dir, "photo.heic")], {
        stdio: "ignore",
      });
    });
  },
);
