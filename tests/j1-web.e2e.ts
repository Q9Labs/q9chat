import { surfaceOf, test, type Browser } from "@e2e-dev/web";
import { api } from "@q9chat/convex";
import { ConvexHttpClient } from "convex/browser";
import { expect, type App, type Screen } from "e2e";
import { Schema } from "effect";

import { Session } from "../apps/web/src/lib/auth/contracts.js";
import { browserEngine, expectMainFullWidth } from "./support/browser.js";
import { webOrigin } from "./support/origin.js";
import {
  magicCode,
  removeTestUser,
  signInPhone,
  deletePhoneProfile,
  type PhoneSession,
} from "./support/workos.js";

type WebJourney = { readonly app: App; readonly browser: Browser; readonly screen: Screen };

async function invalidEmail({ browser, screen }: WebJourney) {
  await screen.getByLabel("Email").fill("not-an-email");
  await screen.getByRole("button", "Email me a code").tap();
  await expect(browser.locator(".toast")).toHaveText("Enter your email address");
}

async function failedSignOut({ browser, screen }: WebJourney) {
  await screen.getByRole("button", "Account", { exact: true }).tap();
  await screen.getByRole("button", "Sign out", { exact: true }).tap();
  await expect(browser.locator(".toast span")).toHaveText("Couldn't sign out. Try again.");
  await expect(screen.getByRole("button", "Try again", { exact: true })).toBeVisible();
}

async function checkSessionRecovery({ app, browser, screen }: WebJourney, email: string) {
  const surface = surfaceOf(browserEngine);
  if (!surface) throw new Error("Missing live e2e browser surface");
  const page = surface.page();
  // Change only the provider label on the real session response, not OAuth authentication.
  for (const method of ["google", "apple"] as const) {
    let arriving = false;
    await page.route("**/api/auth/token", async (route) => {
      if (!arriving) {
        await route.fulfill({ status: 401, json: {} });
        return;
      }
      const response = await route.fetch();
      const session = Schema.decodeUnknownSync(Session)(await response.json());
      await route.fulfill({ response, json: { ...session, method } });
    });
    await page.route(`**/api/auth/oauth/${method}?client=web`, async (route) => {
      arriving = true;
      await route.fulfill({ status: 302, headers: { Location: "/" } });
    });
    await app.open("/");
    await screen
      .getByRole("button", `Continue with ${method === "google" ? "Google" : "Apple"}`)
      .tap();
    await expect(browser.locator(".toast")).toHaveText(
      `Signed in with ${method === "google" ? "Google" : "Apple"}`,
    );
    await expect(screen.getByRole("button", "Account", { exact: true })).toBeVisible();
    // Record every matching notice from the first render, not just after the four-second toast expires.
    await page.addInitScript(() => {
      sessionStorage.removeItem("j1.replayed-notice");
      new MutationObserver(() => {
        if (
          [...document.querySelectorAll(".toast")].some((toast) =>
            /Signed in with (Google|Apple)/u.test(toast.textContent),
          )
        )
          sessionStorage.setItem("j1.replayed-notice", "yes");
      }).observe(document, { childList: true, subtree: true, characterData: true });
    });
    await browser.reload();
    await expect(screen.getByRole("button", "Account", { exact: true })).toBeVisible();
    await expect(browser.locator(".toast")).toHaveCount(0);
    expect(await page.evaluate(() => sessionStorage.getItem("j1.replayed-notice"))).toBe(null);
    await app.open("/?signedIn=1");
    await expect(screen.getByRole("button", "Account", { exact: true })).toBeVisible();
    expect(await page.evaluate(() => sessionStorage.getItem("j1.replayed-notice"))).toBe(null);
    await page.evaluate((provider) => sessionStorage.setItem("q9.oauth-arrival", provider), method);
    await app.open("/?authError=1");
    await expect(screen.getByRole("button", "Account", { exact: true })).toBeVisible();
    expect(await page.evaluate(() => sessionStorage.getItem("q9.oauth-arrival"))).toBe(null);
    expect(await page.evaluate(() => sessionStorage.getItem("j1.replayed-notice"))).toBe(null);
    await page.unrouteAll({ behavior: "wait" });
  }
  await browser.route("**/api/auth/sign-out", (route) =>
    route.fulfill({ status: 503, json: { error: "unavailable" } }),
  );
  await failedSignOut({ app, browser, screen });
  await browser.reload();
  await expect(screen.getByRole("button", "Account", { exact: true })).toBeVisible();
  await expect(browser.locator(".account-button")).toContainText("Nadia Journey");
  await browser.unroute("**/api/auth/sign-out");
  await checkSignOutGenerations({ app, browser, screen }, email);
  await expect(screen.getByRole("button", "Email me a code")).toBeVisible();
  await expect(screen.getByRole("button", "Continue with Google")).toBeVisible();
  await expect(browser.locator(".toast")).toHaveText("Signed out");
  await invalidEmail({ app, browser, screen });
  await browser.reload();
  await expect(screen.getByRole("button", "Email me a code")).toBeVisible();
}

async function checkSignOutGenerations({ browser, screen }: WebJourney, email: string) {
  const surface = surfaceOf(browserEngine);
  if (!surface) throw new Error("Missing live e2e browser surface");
  const page = surface.page();
  const first = Promise.withResolvers<void>();
  const second = Promise.withResolvers<void>();
  const firstStarted = Promise.withResolvers<void>();
  const secondStarted = Promise.withResolvers<void>();
  let requests = 0;
  let emailStarts = 0;
  const observeEmailStart = (request: { url(): string }) => {
    if (request.url().endsWith("/api/auth/email/start")) emailStarts += 1;
  };
  page.on("request", observeEmailStart);
  await page.route("**/api/auth/sign-out", async (route) => {
    const attempt = requests++;
    if (attempt === 0) firstStarted.resolve();
    else secondStarted.resolve();
    await (attempt === 0 ? first.promise : second.promise);
    if (attempt === 0) await route.fulfill({ status: 503, json: { error: "unavailable" } });
    else {
      const response = await route.fetch();
      await route.fulfill({ response });
    }
  });
  const context = surface.context();
  let peer: Awaited<ReturnType<typeof context.newPage>> | undefined;
  try {
    await screen.getByRole("button", "Account", { exact: true }).tap();
    await screen.getByRole("button", "Sign out", { exact: true }).tap();
    await firstStarted.promise;
    await expect(screen.getByRole("button", "Email me a code")).toHaveCount(0);
    await expect(screen.getByLabel("Email", { exact: true })).toHaveCount(0);
    expect(emailStarts).toBe(0);
    first.resolve();
    await expect(screen.getByRole("button", "Email me a code")).toBeVisible();
    await expect(browser.locator(".toast span")).toHaveText("Couldn't sign out. Try again.");
    await expect(screen.getByRole("button", "Try again", { exact: true })).toBeVisible();

    // Sign in through the UI only after the held logout has fully settled.
    await screen.getByLabel("Email", { exact: true }).fill(email);
    await screen.getByRole("button", "Email me a code").tap();
    await expect(screen.getByRole("heading", "Check your email")).toBeVisible();
    expect(emailStarts).toBe(1);
    await screen.getByLabel("Digit 1").fill(await magicCode(email));
    await expect(screen.getByRole("button", "Account", { exact: true })).toBeVisible();
    await browser.reload();
    await expect(screen.getByRole("button", "Account", { exact: true })).toBeVisible();
    peer = await surface.context().newPage();
    await peer.goto(`${webOrigin}/`);
    await peer.getByRole("button", { name: "Account", exact: true }).waitFor();

    // The successful held response also deletes the cookie before another sign-in is offered.
    await screen.getByRole("button", "Account", { exact: true }).tap();
    await screen.getByRole("button", "Sign out", { exact: true }).tap();
    await secondStarted.promise;
    await expect(screen.getByRole("button", "Email me a code")).toHaveCount(0);
    await expect(screen.getByLabel("Email", { exact: true })).toHaveCount(0);
    expect(emailStarts).toBe(1);
    second.resolve();
    await expect(screen.getByRole("button", "Email me a code")).toBeVisible();
    await expect(browser.locator(".toast")).toHaveText("Signed out");
    await screen.getByLabel("Email", { exact: true }).fill(email);
    await screen.getByRole("button", "Email me a code").tap();
    await expect(screen.getByRole("heading", "Check your email")).toBeVisible();
    expect(emailStarts).toBe(2);
    await screen.getByLabel("Digit 1").fill(await magicCode(email));
    await expect(screen.getByRole("button", "Account", { exact: true })).toBeVisible();
    await peer.reload();
    await peer.getByRole("button", { name: "Account", exact: true }).waitFor();
    await browser.reload();
    await expect(screen.getByRole("button", "Account", { exact: true })).toBeVisible();
    expect(requests).toBe(2);
    process.stdout.write(
      "J1 PASS: held logout blocks email sign-in; failure is visible; post-settlement sessions survive reload\n",
    );

    await page.unrouteAll({ behavior: "wait" });
    await screen.getByRole("button", "Account", { exact: true }).tap();
    await screen.getByRole("button", "Sign out", { exact: true }).tap();
    await expect(screen.getByRole("button", "Email me a code")).toBeVisible();
    await peer.getByRole("button", { name: "Email me a code", exact: true }).waitFor();
  } finally {
    first.resolve();
    second.resolve();
    await page.unrouteAll({ behavior: "wait" });
    page.off("request", observeEmailStart);
    await peer?.close();
  }
}

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
    async function avatarColor(avatarSelector: string) {
      return browser.evaluate((selector) => {
        const avatar = document.querySelector(selector);
        if (!(avatar instanceof HTMLElement)) throw new Error("Missing avatar");
        return getComputedStyle(avatar).backgroundColor;
      }, avatarSelector);
    }
    try {
      await browser.setViewport({ width: 1280, height: 800 });
      await browser.emulateMedia({ colorScheme: "light" });
      await app.open("/");
      await expect(screen.getByRole("button", "Continue with Google")).toBeVisible();
      await expect(screen.getByRole("button", "Continue with Apple")).toBeVisible();
      await invalidEmail({ app, browser, screen });
      await screen.getByLabel("Email").fill(email);
      await shot("01-sign-in");
      await screen.getByRole("button", "Email me a code").tap();
      await expect(screen.getByRole("heading", "Check your email")).toBeVisible();
      await expect(screen.getByLabel("Digit 1")).toBeFocused();
      await expect(browser.locator(".auth-hero p")).toHaveText(
        `Enter the 6-digit code we sent to ${email}.`,
      );
      await shot("02-code");
      await magicCode(email);
      await screen.getByLabel("Digit 3").tap();
      await screen.getByRole("button", "send a new code").tap();
      await expect(browser.locator(".toast")).toHaveText("We sent a new code");
      await expect(screen.getByLabel("Digit 1")).toBeFocused();
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
      const setupColor = await avatarColor(".profile-avatar .av");
      await shot("03-setup");
      const surface = surfaceOf(browserEngine);
      if (!surface) throw new Error("Missing live e2e browser surface");
      const secondTab = await surface.context().newPage();
      await secondTab.goto(await browser.url());
      await secondTab.getByRole("heading", { name: "Set up your profile" }).waitFor();
      await secondTab.getByLabel("Your name").fill("Stale second tab draft");
      await browser.evaluate(() => {
        const picker = document.querySelector('input[aria-label="Profile photo"]');
        if (!(picker instanceof HTMLInputElement)) throw new Error("Missing photo input");
        const transfer = new DataTransfer();
        transfer.items.add(
          new File([new Uint8Array(20_000_001)], "large.png", { type: "image/png" }),
        );
        picker.files = transfer.files;
        picker.dispatchEvent(new Event("change", { bubbles: true }));
        return null;
      });
      await expect(browser.locator(".toast")).toHaveText(
        "That photo is over 20 MB. Choose a smaller one.",
      );
      await expect(browser.locator(".profile-avatar .av.photo")).toHaveCount(0);
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
      await secondTab.getByRole("heading", { name: "No groups yet" }).waitFor();
      expect(await secondTab.locator(".account-button").innerText()).toContain("Nadia Journey");
      expect(await secondTab.getByRole("heading", { name: "Set up your profile" }).count()).toBe(0);
      await secondTab.close();
      await expect(browser.locator("nav[aria-label='Your groups']")).toHaveText(
        "Your groups show up here.",
      );
      await expect(browser.locator(".toast")).toHaveText("Welcome, Nadia");
      await expect(browser.locator(".account-button .av.photo")).toBeVisible();
      await screen.getByRole("button", "Account", { exact: true }).tap();
      await browser.locator(".prow button").tap();
      await expect(browser.locator(".account-button .av.photo")).toHaveCount(0);
      await expect(browser.locator("html")).toHaveAttribute("data-photo-urls", "0");
      expect(await avatarColor(".account-button .av")).toBe(setupColor);
      expect(await avatarColor(".profile-avatar .av")).toBe(setupColor);
      await screen.getByRole("button", "Close", { exact: true }).tap();
      await expectMainFullWidth();
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
      // No navigation or reload after the external mutation: this checks the live subscription.
      const row = screen.getByRole("button", "Journey live group, 1 unread", { exact: true });
      await expect(row).toBeVisible();
      await expect(browser.locator(".row .ttl")).toHaveText("Journey live group");
      await expect(browser.locator(".row .pv")).toHaveText("Sara: Welcome to the live group");
      await expect(browser.locator(".row .badge")).toHaveText("1");
      await shot("05-live-groups");
      await checkSessionRecovery({ app, browser, screen }, email);
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

test("OAuth sign in still opens when session storage is unavailable", async ({
  app,
  screen,
  browser,
}) => {
  await app.open("/");
  const surface = surfaceOf(browserEngine);
  if (!surface) throw new Error("Missing live e2e browser surface");
  const page = surface.page();
  await page.addInitScript(() => {
    Object.defineProperty(window, "sessionStorage", {
      get() {
        throw new DOMException("Blocked", "SecurityError");
      },
    });
  });
  await page.route("**/api/auth/oauth/google?client=web", (route) =>
    route.fulfill({ contentType: "text/html", body: "<h1>OAuth navigation started</h1>" }),
  );
  await app.open("/");
  await expect(screen.getByRole("button", "Email me a code")).toBeVisible();
  await screen.getByRole("button", "Continue with Google").tap();
  await expect(screen.getByRole("heading", "OAuth navigation started")).toBeVisible();
  expect(new URL(await browser.url()).pathname).toBe("/api/auth/oauth/google");
});
