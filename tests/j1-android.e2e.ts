import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { crc32, deflateSync } from "node:zlib";

import { test } from "@e2e-dev/mobile";
import { api } from "@q9chat/convex";
import { ConvexHttpClient } from "convex/browser";
import { expect, type Screen } from "e2e";

import { expectButtonHeights } from "./support/targets.js";
import {
  deletePhoneProfile,
  magicCode,
  removeTestUser,
  signInPhone,
  type PhoneSession,
} from "./support/workos.js";

// Journey 1 on the phone, Android emulator edition: same journey and assertions as j1-phone.e2e.ts, plus the
// OAuth checks. Runs against dev Convex and the web Worker on http://localhost:3000 (reached through
// `adb reverse`), on the emulator named by J1_ANDROID_SERIAL.

const convexUrl = "https://quixotic-crab-23.convex.cloud";
const origin = "http://localhost:3000";
const serial = process.env["J1_ANDROID_SERIAL"] ?? "emulator-5590";
const metro = process.env["J1_PHONE_METRO"] ?? "http://localhost:8097";
const shotDir = process.env["J1_SHOT_DIR"] ?? join(tmpdir(), "q9-j1-android-shots");
const metroUrl = `${metro}?__expo_disable_onboarding=1&__expo_disable_fab=1&__expo_disable_auto_launch=1`;
const devClientLink = `exp+q9chat://expo-development-client/?url=${encodeURIComponent(metroUrl)}`;
const SIGN_IN_INCOMPLETE = "Sign-in wasn't completed. Try again.";

function adb(...args: string[]) {
  return execFileSync("adb", ["-s", serial, ...args], { maxBuffer: 64 * 1024 * 1024 });
}

// `adb shell` joins its arguments and runs them through the device shell, so the caller quotes `&` and `?`.
function adbShell(command: string) {
  return adb("shell", command).toString();
}

function shot(name: string) {
  mkdirSync(shotDir, { recursive: true });
  writeFileSync(join(shotDir, `${name}.png`), adb("exec-out", "screencap", "-p"));
}

type Device = Parameters<Parameters<typeof test>[2]>[0]["device"];

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
function openDevClient(device: Device) {
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
function screenDensity() {
  const dpi = Number(/(\d+)\s*$/u.exec(adbShell("wm density").trim())?.[1]);
  return dpi / 160;
}

// This emulator image ships no clipboard shell service, so `device.setClipboard` is unsupported. Instead the
// text is typed into a system text field (the Settings search box), selected and copied with the keyboard
// shortcuts, and Back returns to the app.
async function copyToClipboard(text: string) {
  adbShell("am force-stop com.android.settings");
  adbShell("am start -a android.settings.APP_SEARCH_SETTINGS");
  await new Promise((resolve) => setTimeout(resolve, 2500));
  adbShell(`input text ${text}`);
  adbShell("input keycombination 113 29");
  adbShell("input keycombination 113 31");
  await new Promise((resolve) => setTimeout(resolve, 500));
  // Back closes the keyboard first, then Settings, which returns to the app.
  for (let attempt = 0; attempt < 3; attempt++) {
    adbShell("input keyevent 4");
    await new Promise((resolve) => setTimeout(resolve, 1000));
    if (
      adbShell("dumpsys activity activities | grep -m1 topResumedActivity").includes(
        "ai.q9labs.chat",
      )
    )
      break;
  }
}

// The text-selection toolbar is a system window that neither the app's accessibility tree nor a second
// uiautomator client (the e2e engine already holds the only one) can see, so its Paste item is tapped by
// position. On this 1080 x 2400 emulator the floating toolbar opens just above the code cells, and Paste is
// 278 px right of the field's left edge and 36 px above its top edge (measured from a screenshot).
async function startOf(field: ReturnType<Screen["getByLabel"]>) {
  const box = await field.boundingBox();
  if (!box) throw new Error("The code field has no bounding box");
  return { x: Math.round(box.x + 6), y: Math.round(box.y + box.height / 2) };
}

// A long press at the left edge puts the cursor in front of the first digit and opens the toolbar.
async function longPressAtStart(field: ReturnType<Screen["getByLabel"]>) {
  const { x, y } = await startOf(field);
  adbShell(`input swipe ${x} ${y} ${x} ${y} 900`);
}

async function tapPasteItem(field: ReturnType<Screen["getByLabel"]>) {
  const box = await field.boundingBox();
  if (!box) throw new Error("The code field has no bounding box");
  shot("paste-toolbar");
  adbShell(`input tap ${Math.round(box.x + 278)} ${Math.round(box.y - 36)}`);
}

function pngChunk(type: string, data: Buffer) {
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, checksum]);
}

// A 256 x 256 two-tone PNG, big enough for the Android photo picker to show a thumbnail.
function profilePng() {
  const size = 256;
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 2, 0, 0, 0], 8);
  const rows = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    const row = y * (size * 3 + 1);
    for (let x = 0; x < size; x++) {
      const left = x < size / 2;
      rows.set(left ? [233, 98, 54] : [54, 120, 233], row + 1 + x * 3);
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(rows)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function addPhotoToLibrary() {
  const file = join(mkdtempSync(join(tmpdir(), "q9-j1-photo-")), "q9-j1-profile.png");
  writeFileSync(file, profilePng());
  adb("push", file, "/sdcard/Pictures/q9-j1-profile.png");
  adbShell(
    "am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d file:///sdcard/Pictures/q9-j1-profile.png",
  );
}

test(
  "J1: sign up, set up, live groups and sign out",
  { timeout: 600_000, platforms: ["android"] },
  async ({ app, device, screen }) => {
    const stamp = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
    const email = `q9-j1-${stamp}@example.net`;
    const secondEmail = `q9-j1-peer-${stamp}@example.net`;
    const peer = new ConvexHttpClient(convexUrl);
    let firstAuthenticated = false;
    let peerSession: PhoneSession | undefined;
    try {
      await app.clearState();
      addPhotoToLibrary();
      await openDevClient(device);
      await expect(screen.getByRole("button", "Continue with Google")).toBeVisible({
        timeout: 360_000,
      });
      await expect(screen.getByRole("button", "Continue with Apple")).toBeVisible();
      shot("01-sign-in");

      await screen.getByLabel("Email").fill("not-an-email");
      await screen.getByRole("button", "Email me a code").tap();
      await expect(screen.getByText("Enter your email address")).toBeVisible();

      await screen.getByLabel("Email").fill(email);
      await screen.getByRole("button", "Email me a code").tap();
      await expect(screen.getByRole("heading", "Check your email")).toBeVisible();
      await expect(screen.getByLabel("6-digit code")).toBeFocused();
      await expect(screen.getByText(`Enter the 6-digit code we sent to ${email}.`)).toBeVisible();
      // The two links are separate press targets, each 44 dp tall (one pixel of rounding allowed).
      await expectButtonHeights(
        screen,
        ["send a new code", "Use a different email"],
        Math.floor(44 * screenDensity()) - 1,
      );
      shot("02-code");

      await magicCode(email);
      await screen.getByText("send a new code").tap();
      await expect(screen.getByText("We sent a new code")).toBeVisible();
      await expect(screen.getByLabel("6-digit code")).toBeFocused();
      const code = await magicCode(email);
      // The app clears the field as soon as the sixth digit is wrong, so `fill`'s read-back would fail: type the
      // digits one key at a time instead.
      await screen
        .getByLabel("6-digit code")
        .pressSequentially(code === "000000" ? "111111" : "000000");
      await expect(
        screen.getByText("That code didn't work. Check it and try again."),
      ).toBeVisible();
      await expect(screen.getByLabel("6-digit code")).toHaveValue("");
      await expect(screen.getByLabel("6-digit code")).toBeFocused();
      // A paste lands where the cursor is. Four digits pasted in front of the fifth must read as the first five, in order.
      const codeField = screen.getByLabel("6-digit code");
      await codeField.pressSequentially(code.slice(4, 5));
      shot("02b-one-digit");
      await copyToClipboard(code.slice(0, 4));
      await longPressAtStart(codeField);
      await tapPasteItem(codeField);
      await expect(codeField).toHaveValue(code.slice(0, 5));
      // The whole code pasted in front of a digit that is the code's own first digit: a paste that guesses what
      // was added reads "1234561" as "234561".
      await codeField.fill("");
      await codeField.pressSequentially(code.slice(0, 1));
      await copyToClipboard(code);
      await longPressAtStart(codeField);
      await tapPasteItem(codeField);

      await expect(screen.getByRole("heading", "Set up your profile")).toBeVisible();
      await expect(
        screen.getByText(
          `Signed in as ${email}. Without a photo, people see your initials on your color.`,
        ),
      ).toBeVisible();
      firstAuthenticated = true;
      await screen.getByRole("textbox", "Your name").fill("");
      await expect(screen.getByRole("button", "Continue", { exact: true })).toBeDisabled();
      await screen.getByRole("textbox", "Your name").fill("Nadia Journey");
      await screen.getByRole("button", "Add a photo").tap();
      // The photo picker sheet is still animating open when its thumbnail first appears, and a tap that lands
      // then is dropped (seen once in four runs), so tap again while the sheet is still on screen.
      for (let attempt = 0; attempt < 3; attempt++) {
        if (await screen.getByRole("button", "Remove photo").isVisible()) break;
        await screen.getByLabel(/^Photo taken on/).tap();
        await new Promise((resolve) => setTimeout(resolve, 2500));
      }
      await expect(screen.getByRole("button", "Remove photo")).toBeVisible();
      shot("03-setup");
      await screen.getByRole("button", "Continue", { exact: true }).tap();

      await expect(screen.getByText("No groups yet")).toBeVisible();
      await expect(screen.getByText("Welcome, Nadia")).toBeVisible();
      // The header avatar is the Account button: it must draw the photo or the initials, never a blank circle.
      await expect(screen.getByTestId(/^avatar-(photo|initials)$/)).toBeVisible();
      shot("04-empty-groups");

      const peerSignIn = await signInPhone(secondEmail);
      peerSession = peerSignIn;
      peer.setAuth(peerSignIn.accessToken);
      await peer.action(api.profiles.setUp, { displayName: "Sara Journey" });
      const matches = await peer.query(api.people.find, { query: email });
      const firstUser = matches.find((person) => person.email === email);
      if (!firstUser) throw new Error("The people API must find the first user's finished profile");
      expect(firstUser.fullName).toBe("Nadia Journey");
      const groupId = await peer.mutation(api.groups.create, {
        name: "Journey live group",
        memberIds: [firstUser.id],
        inviteToken: crypto.randomUUID().replaceAll("-", ""),
      });
      await peer.mutation(api.messages.send, {
        groupId,
        clientKey: crypto.randomUUID(),
        body: "Welcome to the live group",
        attachments: [],
      });
      // No navigation after the other person's mutation: this checks the live subscription.
      await expect(
        screen.getByRole("button", "Journey live group, Sara: Welcome to the live group, 1 unread"),
      ).toBeVisible();
      await expect(screen.getByTestId("avatar-photo")).toBeVisible();
      shot("05-live-groups");

      await screen.getByRole("button", "Account", { exact: true }).tap();
      await expect(screen.getByText("Signed in with")).toBeVisible();
      await expect(screen.getByText(`Email code · ${email}`)).toBeVisible();
      shot("06-account");
      // A name edit survives the system Back button.
      const name = screen.getByRole("textbox", "Name", { exact: true });
      await name.fill("Nadia Back");
      await device.dismissKeyboard();
      await device.back();
      await expect(screen.getByText("Journey live group", { exact: false })).toBeVisible();
      await screen.getByRole("button", "Account", { exact: true }).tap();
      await expect(name).toHaveValue("Nadia Back");
      shot("06b-account-after-system-back");
      // The same through the hardware Back key (KEYCODE_BACK) sent straight to the emulator.
      await name.fill("Nadia Key");
      await device.dismissKeyboard();
      adbShell("input keyevent 4");
      await expect(screen.getByText("Journey live group", { exact: false })).toBeVisible();
      await screen.getByRole("button", "Account", { exact: true }).tap();
      await expect(name).toHaveValue("Nadia Key");
      shot("06c-account-after-key-back");
      // Sign out takes the same save-or-discard way out: an unsaved edit is saved before the session ends.
      await name.fill("Nadia Out");
      await device.dismissKeyboard();
      await screen.getByRole("button", "Sign out", { exact: true }).tap();
      await expect(screen.getByRole("button", "Email me a code")).toBeVisible();
      await expect(screen.getByText("Signed out")).toBeVisible();
      shot("07-signed-out");
      await screen.getByLabel("Email").fill(email);
      await screen.getByRole("button", "Email me a code").tap();
      await expect(screen.getByRole("heading", "Check your email")).toBeVisible();
      await screen.getByLabel("6-digit code").pressSequentially(await magicCode(email));
      await expect(screen.getByText("Journey live group", { exact: false })).toBeVisible();
      await screen.getByRole("button", "Account", { exact: true }).tap();
      await expect(name).toHaveValue("Nadia Out");
      shot("08-name-saved-through-sign-out");
    } finally {
      if (peerSession) await deletePhoneProfile(peerSession);
      if (firstAuthenticated) await deletePhoneProfile(await signInPhone(email));
      await Promise.all([removeTestUser(email), removeTestUser(secondEmail)]);
    }
  },
);

test(
  "Google opens a Chrome Custom Tab, and closing it shows the sign-in error",
  { timeout: 180_000, platforms: ["android"] },
  async ({ app, device, screen }) => {
    await app.clearState();
    await openDevClient(device);
    await expect(screen.getByRole("button", "Continue with Google")).toBeVisible();
    await screen.getByRole("button", "Continue with Google").tap();
    // Chrome's first-run screens ("Use without an account", "Got it") are dismissed once per emulator, by hand.
    await expect
      .poll(() => adbShell("dumpsys activity activities | grep -m1 topResumedActivity"), {
        timeout: 30_000,
      })
      .toContain("CustomTabActivity");
    await new Promise((resolve) => setTimeout(resolve, 5000));
    shot("oauth-google-session");
    // The WorkOS page can hold the soft keyboard open, so the first Back only closes the keyboard.
    for (let attempt = 0; attempt < 3; attempt++) {
      await device.back();
      const top = adbShell("dumpsys activity activities | grep -m1 topResumedActivity");
      if (top.includes("ai.q9labs.chat")) break;
    }
    await expect(screen.getByText(SIGN_IN_INCOMPLETE)).toBeVisible();
  },
);

test(
  "a made-up code on the q9chat:// callback returns to the app with the error copy",
  { timeout: 180_000, platforms: ["android"] },
  async ({ app, device, screen }) => {
    await app.clearState();
    await openDevClient(device);
    await expect(screen.getByRole("button", "Email me a code")).toBeVisible();
    adbShell(
      "am start -a android.intent.action.VIEW -d 'q9chat://auth/callback?code=made-up&state=made-up'",
    );
    await expect(screen.getByText(SIGN_IN_INCOMPLETE)).toBeVisible();
    await expect(screen.getByRole("button", "Email me a code")).toBeVisible();
    shot("oauth-made-up-code");
  },
);

test(
  "a made-up code on the phone-callback page returns to the app with the error copy",
  { timeout: 180_000, platforms: ["android"] },
  async ({ app, device, screen }) => {
    await app.clearState();
    await openDevClient(device);
    await expect(screen.getByRole("button", "Email me a code")).toBeVisible();
    adbShell(
      `am start -a android.intent.action.VIEW -p com.android.chrome -d '${origin}/auth/phone-callback?code=made-up&state=made-up'`,
    );
    await expect(screen.getByText(SIGN_IN_INCOMPLETE)).toBeVisible({ timeout: 40_000 });
    await expect(screen.getByRole("button", "Email me a code")).toBeVisible();
    shot("oauth-made-up-code-chrome");
  },
);
