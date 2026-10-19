import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { test } from "@e2e-dev/mobile";

const serial = process.env["J1_ANDROID_SERIAL"] ?? "emulator-5590";
const metro = process.env["J1_PHONE_METRO"] ?? "http://localhost:8097";
const shotDir = process.env["J1_SHOT_DIR"] ?? join(tmpdir(), "q9-j1-android-shots");
const metroUrl = `${metro}?__expo_disable_onboarding=1&__expo_disable_fab=1&__expo_disable_auto_launch=1`;
const devClientLink = `exp+q9chat://expo-development-client/?url=${encodeURIComponent(metroUrl)}`;

export function adb(...args: string[]) {
  return execFileSync("adb", ["-s", serial, ...args], { maxBuffer: 64 * 1024 * 1024 });
}

// `adb shell` joins its arguments and runs them through the device shell, so the caller quotes `&` and `?`.
export function adbShell(command: string) {
  return adb("shell", command).toString();
}

export function shot(name: string) {
  mkdirSync(shotDir, { recursive: true });
  writeFileSync(join(shotDir, `${name}.png`), adb("exec-out", "screencap", "-p"));
}

export type Device = Parameters<Parameters<typeof test>[2]>[0]["device"];

const DEV_MENU_PREFS = `<?xml version='1.0' encoding='utf-8' standalone='yes' ?>
<map>
    <boolean name="isOnboardingFinished" value="true" />
    <boolean name="showsAtLaunch" value="false" />
    <boolean name="showFab" value="false" />
</map>
`;

// Fresh app data makes the dev client show its one-time developer-menu intro and a floating gear button
// that covers the Account avatar. Writing the dev menu's own preferences is the Android twin of the iOS
// launch arguments `-EXDevMenuIsOnboardingFinished YES -EXDevMenuShowFloatingActionButton NO
// -EXDevMenuShowsAtLaunch NO`.
export function openDevClient(device: Device) {
  const file = join(mkdtempSync(join(tmpdir(), "q9-j1-devmenu-")), "devmenu.xml");
  writeFileSync(file, DEV_MENU_PREFS);
  adb("push", file, "/data/local/tmp/q9-devmenu.xml");
  adbShell("am force-stop ai.q9labs.chat");
  adbShell(
    "run-as ai.q9labs.chat sh -c 'mkdir -p shared_prefs && cp /data/local/tmp/q9-devmenu.xml shared_prefs/expo.modules.devmenu.sharedpreferences.xml'",
  );
  return device.openLink(devClientLink);
}

/** Pixels per dp on the emulator, from `wm density` (160 dpi is 1). */
export function screenDensity() {
  const dpi = Number(/(\d+)\s*$/u.exec(adbShell("wm density").trim())?.[1]);
  return dpi / 160;
}
