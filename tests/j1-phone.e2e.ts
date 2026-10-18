import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { test } from "@e2e-dev/mobile";
import { api } from "@q9chat/convex";
import { ConvexHttpClient } from "convex/browser";
import { expect, type Locator, type Screen } from "e2e";

import { expectButtonHeights } from "./support/targets.js";
import {
  deletePhoneProfile,
  magicCode,
  removeTestUser,
  signInPhone,
  type PhoneSession,
} from "./support/workos.js";

// Journey 1 on the phone: sign up with an email code, set up a profile with a photo, see a group another
// person makes arrive live, read the sign-in method on Account, and sign out. Runs against dev Convex and
// the web Worker on http://localhost:3000, on the simulator named by J1_PHONE_UDID.

const convexUrl = "https://quixotic-crab-23.convex.cloud";
const origin = "http://localhost:3000";
const udid = (() => {
  const value = process.env["J1_PHONE_UDID"];
  if (!value)
    throw new Error("J1_PHONE_UDID must name the simulator the dev client is installed on");
  return value;
})();

const PHOTO_JPEG =
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAA0JCgsKCA0LCgsODg0PEyAVExISEyccHhcgLikxMC4pLSwzOko+MzZGNywtQFdBRkxOUlNSMj5aYVpQYEpRUk//2wBDAQ4ODhMREyYVFSZPNS01T09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0//wAARCABAAEADASIAAhEBAxEB/8QAFgABAQEAAAAAAAAAAAAAAAAAAAQG/8QAFRABAQAAAAAAAAAAAAAAAAAAABP/xAAXAQEBAQEAAAAAAAAAAAAAAAAABgQD/8QAFhEBAQEAAAAAAAAAAAAAAAAAABIU/9oADAMBAAIRAxEAPwDDzJq5k11pcISTJq5kzSQkmTVzJmkhJMmrmTNJCyZNXMmntLZCSZNXMmaSEkyauZM0kJJk1cyZpIVzJq5k09pbISTJq5kzSQkmTVzJmkhJMmrmTNJCyZNXMmntLXCSZNXMmaSEkyauZM0kJJk1cyZpIf/Z";

function simctl(...args: string[]) {
  execFileSync("xcrun", ["simctl", ...args], { stdio: "ignore" });
}

// A system sheet from an earlier run (the photo picker, the web sign-in sheet) lingers after it closes and
// hides the next one from the accessibility tree, so each run starts with those hosts stopped.
function stopSystemSheets() {
  for (const bundleId of ["com.apple.PhotosViewService", "com.apple.SafariViewService"])
    spawnSync("xcrun", ["simctl", "terminate", udid, bundleId], { stdio: "ignore" });
}

// A plain fill reads the field back before the controlled input has re-rendered and fails on identical text,
// so the text goes in key by key.
async function enter(field: Locator, text: string) {
  await field.fill("");
  if (text) await field.pressSequentially(text, { delay: 80 });
}

function addPhotoToLibrary() {
  const file = join(mkdtempSync(join(tmpdir(), "q9-j1-photo-")), "profile.jpg");
  writeFileSync(file, Buffer.from(PHOTO_JPEG, "base64"));
  simctl("addmedia", udid, file);
}

const SIGN_IN_INCOMPLETE = "Sign-in wasn't completed. Try again.";

// The system asks once before it opens the WorkOS page, and not at all when it already asked on this
// simulator. Either way the run ends with the auth session's own Cancel button on screen.
async function openGoogleSession(screen: Screen) {
  await screen.getByRole("button", "Continue with Google").tap();
  const consent = screen.getByRole("button", "Continue", { exact: true });
  const cancel = screen.getByRole("button", "Cancel");
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (await cancel.isVisible()) return;
    if (await consent.isVisible()) {
      await consent.tap();
      await expect(cancel).toBeVisible();
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("Neither the system consent nor the auth session opened");
}

// Every attempt keeps its trace, so a retry that passes still leaves the trace of the attempt that failed.
test(
  "Google opens the system auth session, and closing it leaves the sign-in screen ready for another try",
  { timeout: 120_000, platforms: ["ios"], trace: "on" },
  async ({ app, device, screen }) => {
    stopSystemSheets();
    await device.clearKeychain();
    await app.open();
    await openGoogleSession(screen);
    await app.screenshot("oauth-google-session");
    await screen.getByRole("button", "Cancel").tap();
    // What lasts after the error line is gone: the auth session is closed and every way to sign in is back.
    await expect(screen.getByRole("button", "Cancel")).toBeHidden();
    await expect(screen.getByRole("button", "Continue with Google")).toBeEnabled();
    await expect(screen.getByRole("button", "Continue with Apple")).toBeEnabled();
    await expect(screen.getByRole("button", "Email me a code")).toBeEnabled();
  },
);

test(
  "closing the Google auth session shows the sign-in error",
  // The error line is on screen for about two seconds and a runner step can take longer, so a missed line is retried.
  { timeout: 120_000, retries: 2, platforms: ["ios"], trace: "on" },
  async ({ app, device, screen }) => {
    stopSystemSheets();
    await device.clearKeychain();
    await app.open();
    await openGoogleSession(screen);
    // The error line clears itself after about two seconds, so the check starts before the tap returns.
    await Promise.all([
      expect(screen.getByText(SIGN_IN_INCOMPLETE)).toBeVisible(),
      screen.getByRole("button", "Cancel").tap(),
    ]);
  },
);

test(
  "a made-up code on the phone-callback page returns to the app with the error copy",
  { timeout: 120_000, retries: 2, platforms: ["ios"] },
  async ({ app, device, screen }) => {
    await device.clearKeychain();
    await app.open();
    simctl("openurl", udid, `${origin}/auth/phone-callback?code=made-up&state=made-up`);
    // Safari asks before it hands the q9chat link to the app, so the device is pointed at Safari to answer.
    await device.openApp("com.apple.mobilesafari");
    await screen.getByRole("button", "Open").tap();
    await device.openApp("ai.q9labs.chat");
    await expect(screen.getByText(SIGN_IN_INCOMPLETE)).toBeVisible();
    await expect(screen.getByRole("button", "Email me a code")).toBeVisible();
  },
);

test(
  "a failed phone sign-in lands on the return-to-your-phone page",
  { timeout: 120_000, platforms: ["ios"] },
  async ({ app, device, screen }) => {
    await device.clearKeychain();
    simctl("openurl", udid, `${origin}/auth/error?reason=phone_failed`);
    // The page opens in Safari, so the device is pointed at Safari to read it.
    await device.openApp("com.apple.mobilesafari");
    await expect(screen.getByText("Sign-in wasn\u2019t completed")).toBeVisible();
    await expect(
      screen.getByText(
        "Close this page to return to your phone, or try signing in again on the web.",
      ),
    ).toBeVisible();
    await expect(screen.getByRole("link", "Return to Q9 Chat")).toBeVisible();
    await app.screenshot("return-to-your-phone");
  },
);

test(
  "J1: sign up, set up, live groups and sign out",
  { timeout: 300_000, platforms: ["ios"] },
  async ({ app, device, screen }) => {
    const stamp = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
    const email = `q9-j1-${stamp}@example.net`;
    const secondEmail = `q9-j1-peer-${stamp}@example.net`;
    const peer = new ConvexHttpClient(convexUrl);
    let firstAuthenticated = false;
    let peerSession: PhoneSession | undefined;
    try {
      stopSystemSheets();
      await device.clearKeychain();
      addPhotoToLibrary();
      await app.open();
      await expect(screen.getByRole("button", "Continue with Google")).toBeVisible();
      await expect(screen.getByRole("button", "Continue with Apple")).toBeVisible();
      await app.screenshot("01-sign-in");

      await enter(screen.getByLabel("Email"), "not-an-email");
      await screen.getByRole("button", "Email me a code").tap();
      await expect(screen.getByText("Enter your email address")).toBeVisible();

      await enter(screen.getByLabel("Email"), email);
      await screen.getByRole("button", "Email me a code").tap();
      await expect(screen.getByText("Check your email")).toBeVisible();
      await expect(screen.getByLabel("6-digit code")).toBeFocused();
      await expect(screen.getByText(`Enter the 6-digit code we sent to ${email}.`)).toBeVisible();
      // The two links are separate press targets, each at least 44 points tall.
      await expectButtonHeights(screen, ["send a new code", "Use a different email"], 44);
      await app.screenshot("02-code");

      await magicCode(email);
      await screen.getByRole("button", "send a new code").tap();
      await expect(screen.getByText("We sent a new code")).toBeVisible();
      await expect(screen.getByLabel("6-digit code")).toBeFocused();
      const code = await magicCode(email);
      // The field clears itself on a wrong code, so the digits are typed key by key.
      await screen
        .getByLabel("6-digit code")
        .pressSequentially(code === "000000" ? "111111" : "000000", { delay: 80 });
      await expect(
        screen.getByText("That code didn't work. Check it and try again."),
      ).toBeVisible();
      await expect(screen.getByLabel("6-digit code")).toHaveValue("");
      await expect(screen.getByLabel("6-digit code")).toBeFocused();
      // A paste lands where the cursor is. Four digits pasted in front of the fifth must read as the first five, in order.
      const codeField = screen.getByLabel("6-digit code");
      const box = await codeField.boundingBox();
      if (!box) throw new Error("The code field has no bounding box");
      // The first tap puts the cursor in front of the first digit, the second opens the edit menu on it.
      const pasteAtStart = async () => {
        const beforeDigit = { x: 2, y: box.height / 2 };
        await codeField.tap({ position: beforeDigit });
        await codeField.tap({ position: beforeDigit });
        await screen.getByText("Paste", { exact: true }).tap();
      };
      await codeField.pressSequentially(code.slice(4, 5), { delay: 80 });
      await device.setClipboard(code.slice(0, 4));
      await pasteAtStart();
      await expect(codeField).toHaveValue(code.slice(0, 5));
      // The whole code pasted in front of a digit that is the code's own first digit: a paste that guesses what
      // was added reads "1234561" as "234561".
      await codeField.fill("");
      await codeField.pressSequentially(code.slice(0, 1), { delay: 80 });
      await device.setClipboard(code);
      await app.screenshot("02b-paste-at-start");
      await pasteAtStart();

      await expect(screen.getByText("Set up your profile")).toBeVisible();
      await expect(
        screen.getByText(
          `Signed in as ${email}. Without a photo, people see your initials on your color.`,
        ),
      ).toBeVisible();
      firstAuthenticated = true;
      // The photo goes first: the keyboard's large accessibility tree makes the picker unreadable for the runner.
      await screen.getByRole("button", "Add a photo").tap();
      // The picker lists the library newest first, so the first photo is the one added at the start of this test.
      await screen
        .getByRole("image", /^Photo, /)
        .first()
        .tap();
      await expect(screen.getByRole("button", "Remove photo")).toBeVisible();
      await enter(screen.getByRole("textbox", "Your name"), "");
      await expect(screen.getByRole("button", "Continue", { exact: true })).toBeDisabled();
      await enter(screen.getByRole("textbox", "Your name"), "Nadia Journey");
      await app.screenshot("03-setup");
      await screen.getByRole("button", "Continue", { exact: true }).tap();

      await expect(screen.getByText("No groups yet")).toBeVisible();
      await expect(screen.getByText("Welcome, Nadia")).toBeVisible();
      // The header avatar is the Account button: it must draw the photo or the initials, never a blank circle.
      await expect(screen.getByTestId(/^avatar-(photo|initials)$/)).toBeVisible();
      await app.screenshot("04-empty-groups");

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
      await app.screenshot("05-live-groups");

      await screen.getByRole("button", "Account", { exact: true }).tap();
      await expect(screen.getByText("Signed in with")).toBeVisible();
      await expect(screen.getByText(`Email code · ${email}`)).toBeVisible();
      await app.screenshot("06-account");
      // A name edit survives every way out: the iOS swipe back, then the header arrow.
      const name = screen.getByRole("textbox", "Name", { exact: true });
      await name.fill("Nadia Swipe");
      await device.dismissKeyboard();
      await screen.swipe({ from: { x: 2, y: 400 }, to: { x: 300, y: 400 } });
      await expect(screen.getByText("Journey live group", { exact: false })).toBeVisible();
      await screen.getByRole("button", "Account", { exact: true }).tap();
      await expect(name).toHaveValue("Nadia Swipe");
      await name.fill("Nadia Arrow");
      await screen.getByRole("button", "Back").tap();
      await expect(screen.getByText("Journey live group", { exact: false })).toBeVisible();
      await screen.getByRole("button", "Account", { exact: true }).tap();
      await expect(name).toHaveValue("Nadia Arrow");
      // Sign out takes the same save-or-discard way out: an unsaved edit is saved before the session ends.
      await name.fill("Nadia Out");
      await device.dismissKeyboard();
      await screen.getByRole("button", "Sign out", { exact: true }).tap();
      await expect(screen.getByRole("button", "Email me a code")).toBeVisible();
      await expect(screen.getByText("Signed out")).toBeVisible();
      await app.screenshot("07-signed-out");
      await enter(screen.getByLabel("Email"), email);
      await screen.getByRole("button", "Email me a code").tap();
      await expect(screen.getByText("Check your email")).toBeVisible();
      await screen
        .getByLabel("6-digit code")
        .pressSequentially(await magicCode(email), { delay: 80 });
      await expect(screen.getByText("Journey live group", { exact: false })).toBeVisible();
      await screen.getByRole("button", "Account", { exact: true }).tap();
      await expect(name).toHaveValue("Nadia Out");
      await app.screenshot("08-name-saved-through-sign-out");
    } finally {
      if (peerSession) await deletePhoneProfile(peerSession);
      if (firstAuthenticated) await deletePhoneProfile(await signInPhone(email));
      await Promise.all([removeTestUser(email), removeTestUser(secondEmail)]);
    }
  },
);
