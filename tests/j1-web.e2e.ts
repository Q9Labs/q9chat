import { test } from "@e2e-dev/web";
import { api } from "@q9chat/convex";
import { ConvexHttpClient } from "convex/browser";
import { expect } from "e2e";

import {
  magicCode,
  removeTestUser,
  signInPhone,
  deletePhoneProfile,
  type PhoneSession,
} from "./support/workos.js";

const convexUrl = "https://quixotic-crab-23.convex.cloud";

test(
  "J1: sign up, set up, live groups and sign out",
  { timeout: 180_000 },
  async ({ app, browser, screen }) => {
    const stamp = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
    const email = `q9-j1-${stamp}@example.net`;
    const secondEmail = `q9-j1-peer-${stamp}@example.net`;
    const peer = new ConvexHttpClient(convexUrl);
    let firstAuthenticated = false;
    let peerSession: PhoneSession | undefined;
    async function shot(name: string) {
      await app.screenshot(name);
    }
    try {
      await browser.setViewport({ width: 1280, height: 800 });
      await browser.emulateMedia({ colorScheme: "light" });
      await app.open("/");
      await expect(screen.getByRole("button", "Continue with Google")).toBeVisible();
      await expect(screen.getByRole("button", "Continue with Apple")).toBeVisible();
      await screen.getByLabel("Email").fill("not-an-email");
      await screen.getByRole("button", "Email me a code").tap();
      await expect(browser.locator(".toast")).toHaveText("Enter your email address");
      await screen.getByLabel("Email").fill(email);
      await shot("01-sign-in");
      await screen.getByRole("button", "Email me a code").tap();
      await expect(screen.getByRole("heading", "Check your email")).toBeVisible();
      await expect(browser.locator(".auth-hero p")).toHaveText(
        `Enter the 6-digit code we sent to ${email}.`,
      );
      await shot("02-code");
      const code = await magicCode(email);
      await screen.getByLabel("Digit 1").fill(code === "000000" ? "111111" : "000000");
      await expect(screen.getByRole("alert")).toHaveText(
        "That code didn't work. Check it and try again.",
      );
      await expect(screen.getByLabel("Digit 1")).toHaveValue("");
      await expect(screen.getByLabel("Digit 1")).toBeFocused();
      await screen.getByLabel("Digit 1").fill(code);
      await expect(screen.getByRole("heading", "Set up your profile")).toBeVisible();
      await expect(browser.locator(".auth-card .note")).toHaveText(
        `Signed in as ${email}. Without a photo, people see your initials on your color.`,
      );
      firstAuthenticated = true;
      await screen.getByLabel("Your name").fill("");
      await expect(screen.getByRole("button", "Continue", { exact: true })).toBeDisabled();
      await screen.getByLabel("Your name").fill("Nadia Journey");
      await shot("03-setup");
      await browser.evaluate(() => {
        // Observe the real preview and protected-photo resources, including their cleanup.
        const urls = new Set<string>();
        const create = URL.createObjectURL.bind(URL);
        const revoke = URL.revokeObjectURL.bind(URL);
        const record = () => {
          document.documentElement.dataset["photoUrls"] = String(urls.size);
        };
        URL.createObjectURL = (blob) => {
          const url = create(blob);
          urls.add(url);
          record();
          return url;
        };
        URL.revokeObjectURL = (url) => {
          urls.delete(url);
          revoke(url);
          record();
        };
        record();
        const picker = document.querySelector('input[aria-label="Profile photo"]');
        if (!(picker instanceof HTMLInputElement)) throw new Error("Missing profile photo input");
        const bytes = Uint8Array.from(
          atob(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jW4UAAAAASUVORK5CYII=",
          ),
          (character) => character.charCodeAt(0),
        );
        const transfer = new DataTransfer();
        transfer.items.add(new File([bytes], "profile.png", { type: "image/png" }));
        picker.files = transfer.files;
        picker.dispatchEvent(new Event("change", { bubbles: true }));
        return null;
      });
      await expect(browser.locator(".profile-avatar .av.photo")).toBeVisible();
      await screen.getByRole("button", "Continue", { exact: true }).tap();
      await expect(screen.getByRole("heading", "No groups yet")).toBeVisible();
      await expect(browser.locator("nav[aria-label='Your groups']")).toHaveText(
        "Your groups show up here.",
      );
      await expect(browser.locator(".toast")).toHaveText("Welcome, Nadia");
      await expect(browser.locator(".account-button .av.photo")).toBeVisible();
      await screen.getByRole("button", "Account", { exact: true }).tap();
      await browser.locator(".prow button").tap();
      await expect(browser.locator(".account-button .av.photo")).toHaveCount(0);
      await expect(browser.locator("html")).toHaveAttribute("data-photo-urls", "0");
      await screen.getByRole("button", "Close", { exact: true }).tap();
      await shot("04-empty-groups");
      await screen.getByRole("button", "Account", { exact: true }).tap();
      await expect(screen.getByRole("dialog", "Account")).toBeVisible();
      await expect(browser.locator(".dialog-head h3")).toHaveText("Account");
      await expect(browser.locator(".flat")).toHaveText(`Email code · ${email}`);
      await shot("06-account");
      await screen.getByRole("button", "Close", { exact: true }).tap();

      peerSession = await signInPhone(secondEmail);
      peer.setAuth(peerSession.accessToken);
      await peer.action(api.profiles.setUp, { displayName: "Sara Journey" });
      const matches = await peer.query(api.people.find, { query: email });
      const firstUser = matches.find((person) => person.email === email);
      if (!firstUser)
        throw new Error("The public people API must find the first user's completed profile");
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
      // No navigation or reload after the external mutation: this checks the live subscription.
      const row = screen.getByRole("button", "Journey live group, 1 unread", { exact: true });
      await expect(row).toBeVisible();
      await expect(browser.locator(".row .ttl")).toHaveText("Journey live group");
      await expect(browser.locator(".row .pv")).toHaveText("Sara: Welcome to the live group");
      await expect(browser.locator(".row .badge")).toHaveText("1");
      await shot("05-live-groups");
      await screen.getByRole("button", "Account", { exact: true }).tap();
      await screen.getByRole("button", "Sign out", { exact: true }).tap();
      await expect(screen.getByRole("button", "Email me a code")).toBeVisible();
      await expect(screen.getByRole("button", "Continue with Google")).toBeVisible();
      await expect(browser.locator(".toast")).toHaveText("Signed out");
      await browser.reload();
      await expect(screen.getByRole("button", "Email me a code")).toBeVisible();
    } finally {
      if (peerSession) await deletePhoneProfile(peerSession);
      if (firstAuthenticated) await deletePhoneProfile(await signInPhone(email));
      await Promise.all([removeTestUser(email), removeTestUser(secondEmail)]);
    }
  },
);

test("OAuth error returns to sign in", async ({ app, screen, browser }) => {
  await app.open("/auth/error?reason=cancelled");
  await expect(screen.getByRole("button", "Email me a code")).toBeVisible();
  await expect(browser.locator(".toast")).toHaveText("Sign-in wasn't completed. Try again.");
});

test(
  "capture the approved mock states",
  { timeout: 60_000 },
  async ({ app, browser, screen: ui }) => {
    test.skip(
      process.env["J1_CAPTURE_MOCKS"] !== "1",
      "Optional local mock reference supplied by the proof runner",
    );
    await browser.setViewport({ width: 1280, height: 800 });
    for (const [name, screen, who] of [
      ["01-sign-in", "signin", "new"],
      ["02-code", "code", "new"],
      ["03-setup", "profile", "new"],
      ["04-empty-groups", "groups", "new"],
      ["05-live-groups", "groups", "hasan"],
      ["06-account", "account", "new"],
    ] as const) {
      await app.open(
        `/j1-mock.html?state=${screen}-${who}#device=web&theme=light&who=${who}&screen=${screen}`,
      );
      await expect(browser.locator("#q")).toBeVisible();
      if (screen === "code")
        await expect(ui.getByRole("heading", "Check your email")).toBeVisible();
      if (screen === "profile")
        await expect(ui.getByRole("heading", "Set up your profile")).toBeVisible();
      if (screen === "account")
        await expect(ui.getByRole("heading", "Account", { exact: true })).toBeVisible();
      await browser.evaluate(() => {
        const q = document.querySelector("#q");
        const definitions = document.querySelector("svg.defs");
        if (!(q instanceof HTMLElement)) throw new Error("Missing mock app");
        if (definitions) document.body.append(definitions);
        document.body.replaceChildren(...(definitions ? [definitions, q] : [q]));
        Object.assign(q.style, { position: "fixed", inset: "0", width: "1280px", height: "800px" });
        document.body.style.margin = "0";
        return null;
      });
      await app.screenshot(`mock-${name}`);
    }
  },
);
