import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { test } from "@e2e-dev/mobile";
import { api } from "@q9chat/convex";
import { ConvexHttpClient } from "convex/browser";
import { expect } from "e2e";

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

const ONE_PIXEL_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jW4UAAAAASUVORK5CYII=";

function simctl(...args: string[]) {
  execFileSync("xcrun", ["simctl", ...args], { stdio: "ignore" });
}

function addPhotoToLibrary() {
  const file = join(mkdtempSync(join(tmpdir(), "q9-j1-photo-")), "profile.png");
  writeFileSync(file, Buffer.from(ONE_PIXEL_PNG, "base64"));
  simctl("addmedia", udid, file);
}

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
      await device.clearKeychain();
      addPhotoToLibrary();
      await app.open();
      await expect(screen.getByRole("button", "Continue with Google")).toBeVisible();
      await expect(screen.getByRole("button", "Continue with Apple")).toBeVisible();

      await screen.getByLabel("Email").fill("not-an-email");
      await screen.getByRole("button", "Email me a code").tap();
      await expect(screen.getByText("Enter your email address")).toBeVisible();

      await screen.getByLabel("Email").fill(email);
      await screen.getByRole("button", "Email me a code").tap();
      await expect(screen.getByRole("heading", "Check your email")).toBeVisible();
      await expect(screen.getByLabel("Digit 1")).toBeFocused();
      await expect(screen.getByText(`Enter the 6-digit code we sent to ${email}.`)).toBeVisible();
      await app.screenshot("02-code");

      await magicCode(email);
      await screen.getByText("send a new code").tap();
      await expect(screen.getByText("We sent a new code")).toBeVisible();
      await expect(screen.getByLabel("Digit 1")).toBeFocused();
      const code = await magicCode(email);
      await screen.getByLabel("Digit 1").fill(code === "000000" ? "111111" : "000000");
      await expect(
        screen.getByText("That code didn't work. Check it and try again."),
      ).toBeVisible();
      await expect(screen.getByLabel("Digit 1")).toHaveValue("");
      await expect(screen.getByLabel("Digit 1")).toBeFocused();
      await screen.getByLabel("Digit 1").fill(code);

      await expect(screen.getByRole("heading", "Set up your profile")).toBeVisible();
      await expect(
        screen.getByText(
          `Signed in as ${email}. Without a photo, people see your initials on your color.`,
        ),
      ).toBeVisible();
      firstAuthenticated = true;
      await screen.getByLabel("Your name").fill("");
      await expect(screen.getByRole("button", "Continue", { exact: true })).toBeDisabled();
      await screen.getByLabel("Your name").fill("Nadia Journey");
      await screen.getByRole("button", "Add a photo").tap();
      await screen.getByLabel(/^Photo/).tap();
      await expect(screen.getByRole("button", "Remove photo")).toBeVisible();
      await app.screenshot("03-setup");
      await screen.getByRole("button", "Continue", { exact: true }).tap();

      await expect(screen.getByText("No groups yet")).toBeVisible();
      await expect(screen.getByText("Welcome, Nadia")).toBeVisible();
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
      await expect(screen.getByRole("button", "Journey live group, 1 unread")).toBeVisible();
      await expect(screen.getByText("Sara: Welcome to the live group")).toBeVisible();
      await app.screenshot("05-live-groups");

      await screen.getByRole("button", "Account", { exact: true }).tap();
      await expect(screen.getByText("Signed in with")).toBeVisible();
      await expect(screen.getByText(`Email code · ${email}`)).toBeVisible();
      await app.screenshot("06-account");
      await screen.getByRole("button", "Sign out", { exact: true }).tap();
      await expect(screen.getByRole("button", "Email me a code")).toBeVisible();
      await expect(screen.getByText("Signed out")).toBeVisible();
      await app.screenshot("07-signed-out");
    } finally {
      if (peerSession) await deletePhoneProfile(peerSession);
      if (firstAuthenticated) await deletePhoneProfile(await signInPhone(email));
      await Promise.all([removeTestUser(email), removeTestUser(secondEmail)]);
    }
  },
);

const SIGN_IN_INCOMPLETE = "Sign-in wasn't completed. Try again.";

test(
  "Google opens the system auth session, and closing it shows the sign-in error",
  { timeout: 120_000, platforms: ["ios"] },
  async ({ app, device, screen }) => {
    await device.clearKeychain();
    await app.open();
    await screen.getByRole("button", "Continue with Google").tap();
    // The system asks once before it opens the WorkOS page; the proof runner reads the page it shows.
    await screen.getByRole("button", "Continue", { exact: true }).tap();
    await app.screenshot("oauth-google-session");
    await screen.getByRole("button", "Cancel").tap();
    await expect(screen.getByText(SIGN_IN_INCOMPLETE)).toBeVisible();
  },
);

test(
  "a made-up code on the phone-callback page returns to the app with the error copy",
  { timeout: 120_000, platforms: ["ios"] },
  async ({ app, device, screen }) => {
    await device.clearKeychain();
    await app.open();
    simctl("openurl", udid, `${origin}/auth/phone-callback?code=made-up&state=made-up`);
    await screen.getByRole("button", "Open").tap();
    await expect(screen.getByText(SIGN_IN_INCOMPLETE)).toBeVisible();
    await expect(screen.getByRole("button", "Email me a code")).toBeVisible();
  },
);

test(
  "a failed phone sign-in lands on the return-to-your-phone page",
  { timeout: 120_000, platforms: ["ios"] },
  async ({ device }) => {
    await device.clearKeychain();
    simctl("openurl", udid, `${origin}/auth/error?reason=phone_failed`);
    await expect(
      device.locator(
        "label=Close this page to return to your phone, or try signing in again on the web.",
      ),
    ).toBeVisible();
  },
);
