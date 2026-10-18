import { surfaceOf, test } from "@e2e-dev/web";
import { api } from "@q9chat/convex";
import { ConvexHttpClient } from "convex/browser";
import { expect } from "e2e";
import { Schema } from "effect";

import { Session } from "../apps/web/src/lib/auth/contracts.js";
import { browserEngine, expectMainFullWidth } from "./support/browser.js";
import { magicCode, removeTestUser } from "./support/workos.js";

const convexUrl = "https://quixotic-crab-23.convex.cloud";

function required<T>(value: T | null | undefined, message: string): T {
  if (value === null || value === undefined) throw new Error(message);
  return value;
}

test(
  "J2: create, pair, add people, message and join by invite",
  { timeout: 480_000 },
  async ({ app, browser, screen }) => {
    const stamp = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
    const email = (person: string) => `q9-j2-${person}-${stamp}@example.net`;
    const clients: ConvexHttpClient[] = [];
    const surface = required(surfaceOf(browserEngine), "Missing live e2e browser surface");
    const engine = required(surface.context().browser(), "Missing browser for independent members");
    const bContext = await engine.newContext();
    const cContext = await engine.newContext();
    async function expectPair() {
      await expect(browser.locator(".chat-title b .tt")).toHaveText("Bilal Journey");
      await expect(browser.locator("[role=log] .sys")).toHaveText(
        "This is the start of your group with Bilal",
      );
    }
    async function clientFor(context: typeof bContext) {
      const response = await context.request.post("http://localhost:3000/api/auth/token", {
        headers: { Origin: "http://localhost:3000" },
        data: {},
      });
      expect(response.status()).toBe(200);
      const session = Schema.decodeUnknownSync(Session)(await response.json());
      const client = new ConvexHttpClient(convexUrl);
      client.setAuth(session.accessToken);
      return client;
    }
    async function peer(context: typeof bContext, person: string, name: string) {
      const headers = { Origin: "http://localhost:3000" };
      expect(
        (
          await context.request.post("http://localhost:3000/api/auth/email/start", {
            headers,
            data: { email: email(person) },
          })
        ).status(),
      ).toBe(200);
      expect(
        (
          await context.request.post("http://localhost:3000/api/auth/email/verify", {
            headers,
            data: { email: email(person), code: await magicCode(email(person)), client: "web" },
          })
        ).status(),
      ).toBe(200);
      const client = await clientFor(context);
      const id = await client.action(api.profiles.setUp, { displayName: name });
      clients.push(client);
      return { client, id };
    }
    async function signUp(person: string, name: string) {
      await screen.getByLabel("Email").fill(email(person));
      await screen.getByRole("button", "Email me a code").tap();
      await expect(screen.getByRole("heading", "Check your email")).toBeVisible();
      await screen.getByLabel("Digit 1").fill(await magicCode(email(person)));
      await expect(screen.getByRole("heading", "Set up your profile")).toBeVisible();
      await screen.getByLabel("Your name").fill(name);
      await screen.getByRole("button", "Continue", { exact: true }).tap();
    }
    async function pick(address: string, name: string) {
      await screen.getByLabel("Add people", { exact: true }).fill(address);
      await expect(browser.locator(".suggestions button b")).toHaveText(name);
      await browser.locator(".suggestions button").tap();
      await expect(screen.getByRole("button", `Remove ${name}`, { exact: true })).toBeVisible();
    }
    try {
      await surface.context().grantPermissions(["clipboard-read", "clipboard-write"], {
        origin: "http://localhost:3000",
      });
      await browser.setViewport({ width: 1280, height: 800 });
      await browser.emulateMedia({ colorScheme: "light" });
      const b = await peer(bContext, "b", "Bilal Journey");
      await peer(cContext, "c", "Cora Journey");
      // Separate real cookie jars: these pages remain open to observe live list updates.
      const bPage = await bContext.newPage();
      const cPage = await cContext.newPage();
      await Promise.all([
        bPage.goto("http://localhost:3000/"),
        cPage.goto("http://localhost:3000/"),
      ]);
      await Promise.all([
        bPage.getByRole("heading", { name: "No groups yet" }).waitFor(),
        cPage.getByRole("heading", { name: "No groups yet" }).waitFor(),
      ]);
      await app.open("/");
      await signUp("a", "Amal Journey");
      await expect(screen.getByRole("heading", "No groups yet")).toBeVisible();
      const a = await clientFor(surface.context());
      clients.push(a);
      await screen.getByRole("button", "New group", { exact: true }).first().tap();
      await expect(screen.getByRole("button", "Create group", { exact: true })).toBeDisabled();
      await expect(browser.locator(".hint span")).toHaveText(
        "People with an account can be added by name or email. For anyone else, share the invite link.",
      );
      await screen.getByLabel("Add people", { exact: true }).fill(email("a"));
      await expect(browser.locator(".hint span")).toHaveText("That's you.");
      await expect(browser.locator(".suggestions button")).toHaveCount(0);
      await screen.getByLabel("Add people", { exact: true }).fill("");
      await screen.getByLabel("Group name", { exact: true }).fill("Launch");
      await screen.getByLabel("Add people", { exact: true }).fill("x".repeat(101));
      await expect(screen.getByRole("alert")).toHaveText(
        "Use 100 characters or fewer to find someone.",
      );
      await expect(screen.getByLabel("Group name", { exact: true })).toHaveValue("Launch");
      await screen.getByLabel("Add people", { exact: true }).fill("");
      await pick(email("b"), "Bilal");
      await screen.getByRole("button", "Remove Bilal", { exact: true }).tap();
      await expect(screen.getByRole("button", "Remove Bilal", { exact: true })).toHaveCount(0);
      await pick(email("b"), "Bilal");
      await screen.getByLabel("Add people", { exact: true }).fill(email("c"));
      await expect(browser.locator(".suggestions button b")).toHaveText("Cora");
      await app.screenshot("j2-01-new-group-suggestions-chips");
      await screen.getByLabel("Add people", { exact: true }).fill("");
      await screen.getByRole("button", "Create group", { exact: true }).tap();
      await expect(browser.locator(".chat-title b .tt")).toHaveText("Launch");
      await expect(browser.locator("[role=log] .sys")).toHaveText([
        "You created this group",
        "You added Bilal",
      ]);
      await expect(screen.getByRole("button", "Launch", { exact: true })).toBeVisible();
      await bPage.getByRole("button", { name: "Launch", exact: true }).waitFor();
      expect(await bPage.locator(".row .ttl").allTextContents()).toEqual(["Launch"]);
      await expectMainFullWidth();
      await app.screenshot("j2-02-created-group");
      const launch = required(
        (await a.query(api.groups.list, {})).find((row) => row.title === "Launch"),
        "Missing newly created group",
      );

      await screen.getByRole("button", "New group", { exact: true }).first().tap();
      await pick(email("b"), "Bilal");
      await expect(browser.locator(".dlg .link-box")).toHaveCount(0);
      await expect(browser.locator(".dlg .note")).toHaveText(
        "Add a name or more people to get an invite link.",
      );
      await screen.getByRole("button", "Start a group with Bilal", { exact: true }).tap();
      await expectPair();
      await expectMainFullWidth();
      await expect(browser.locator('.row[aria-label="Bilal Journey"] .pv')).toHaveText(
        "This is the start of your group with Bilal",
      );
      await app.screenshot("j2-03-pair-start");
      const firstPair = await a.query(api.groups.pairWith, { profileId: b.id });
      await screen.getByRole("button", "New group", { exact: true }).first().tap();
      await pick(email("b"), "Bilal");
      await screen.getByRole("button", "Open your group with Bilal", { exact: true }).tap();
      await expectPair();
      expect(await a.query(api.groups.pairWith, { profileId: b.id })).toBe(firstPair);
      expect((await a.query(api.groups.list, {})).filter((row) => row.kind === "pair").length).toBe(
        1,
      );
      await screen.getByRole("button", "Group info", { exact: true }).tap();
      await expect(screen.getByRole("button", "Add people", { exact: true })).toHaveCount(0);
      await expect(screen.getByRole("button", "Copy invite link", { exact: true })).toHaveCount(0);
      await screen.getByRole("button", "Close group info", { exact: true }).tap();

      await screen.getByRole("button", "Launch", { exact: true }).tap();
      await a.mutation(api.messages.send, {
        groupId: launch.groupId,
        clientKey: crypto.randomUUID(),
        body: "Launch history",
        attachments: [],
      });
      await expect(browser.locator("[role=log] p")).toHaveText("Launch history");
      await screen.getByRole("button", "Group info", { exact: true }).tap();
      await expect(browser.locator(".info .mrow b")).toHaveCount(2);
      expect((await browser.locator(".info .mrow b").allTextContents()).toSorted()).toEqual([
        "Amal Journey (you)",
        "Bilal Journey",
      ]);
      await screen.getByRole("button", "Copy invite link", { exact: true }).tap();
      await expect(browser.locator(".toast")).toHaveText("Invite link copied");
      await expect(screen.getByRole("button", "Copied", { exact: true })).toBeVisible();
      await expect(screen.getByRole("tooltip")).toHaveText("Copied");
      const link = await surface.page().evaluate(() => navigator.clipboard.readText());
      await expect(browser.locator(".info .link-box code")).toHaveText(link.replace("http://", ""));
      expect(new URL(link).origin).toBe("http://localhost:3000");
      expect(new URL(link).pathname).toMatch(/^\/join\/[A-Za-z0-9]{16}$/u);
      expect(await surface.page().evaluate(() => navigator.clipboard.readText())).toBe(link);
      await app.screenshot("j2-04-group-info-copied");
      await browser.locator(".iqa button").first().tap();
      await pick(email("c"), "Cora");
      await screen.getByRole("button", "Add Cora", { exact: true }).tap();
      await expect(browser.locator(".toast")).toHaveText("Added Cora");
      await expect(browser.locator("[role=log] .sys")).toHaveText([
        "You created this group",
        "You added Bilal",
        "You added Cora",
      ]);
      await cPage.getByRole("button", { name: "Launch", exact: true }).waitFor();
      await cPage.getByRole("button", { name: "Launch", exact: true }).click();
      await cPage.getByRole("log").getByText("Launch history", { exact: true }).waitFor();
      expect(
        await cPage.getByRole("log").getByText("Launch history", { exact: true }).innerText(),
      ).toBe("Launch history");
      await browser.locator(".iqa button").first().tap();
      const unknown = email("unknown");
      await screen.getByLabel("Add people", { exact: true }).fill(unknown);
      await expect(browser.locator(".hint span")).toHaveText(
        `${unknown} doesn't have an account yet. Share the invite link, and they join once they sign up.`,
      );
      await expect(browser.locator(".suggestions button")).toHaveCount(0);
      await expect(
        screen
          .getByRole("dialog", "Add people to Launch")
          .getByRole("button", "Add people", { exact: true }),
      ).toBeDisabled();
      await app.screenshot("j2-05-add-unknown-email");
      await screen.getByRole("button", "Cancel", { exact: true }).tap();
      await surface.page().locator(".info .mrow").filter({ hasText: "Bilal Journey" }).hover();
      await browser
        .locator(".info .mrow")
        .filter({ hasText: "Bilal Journey" })
        .getByRole("button", "Message", { exact: true })
        .tap();
      await expectPair();
      expect(await a.query(api.groups.pairWith, { profileId: b.id })).toBe(firstPair);
      await screen.getByRole("button", "Launch", { exact: true }).tap();
      await b.client.mutation(api.messages.send, {
        groupId: launch.groupId,
        clientKey: crypto.randomUUID(),
        body: "Ready for launch",
        attachments: [],
      });
      await expect(screen.getByRole("button", "About Bilal", { exact: true })).toBeVisible();
      await screen.getByRole("button", "About Bilal", { exact: true }).tap();
      await screen.getByRole("button", "Message", { exact: true }).tap();
      await expectPair();

      await screen.getByRole("button", "New group", { exact: true }).first().tap();
      await screen.getByLabel("Group name", { exact: true }).fill("x".repeat(81));
      await screen.getByRole("button", "Create group", { exact: true }).tap();
      await expect(screen.getByRole("alert")).toHaveText(
        "Use a group name of 80 characters or fewer.",
      );
      await screen.getByLabel("Group name", { exact: true }).fill("");
      await screen.getByLabel("Add people", { exact: true }).fill("Bi");
      await expect(browser.locator(".suggestions button b")).toHaveText("Bilal");
      await browser.locator(".suggestions button").tap();
      await pick(email("c"), "Cora");
      await screen.getByRole("button", "Create group", { exact: true }).tap();
      await expect(browser.locator(".chat-title b .tt")).toHaveText("Bilal, Cora");
      await expect(browser.locator("[role=log] .sys")).toHaveText([
        "You created this group",
        "You added Bilal, Cora",
      ]);
      const namedGroup = required(
        (await a.query(api.groups.list, {})).find((row) => row.title === "Bilal, Cora"),
        "Missing server-named group",
      );
      let newest = "";
      for (let index = 0; index < 20; index++) {
        newest = `History ${index}: ${"Launch plan. ".repeat(40)}`.trim();
        await a.mutation(api.messages.send, {
          groupId: namedGroup.groupId,
          clientKey: crypto.randomUUID(),
          body: newest,
          attachments: [],
        });
      }
      await screen.getByRole("button", "Bilal Journey", { exact: true }).tap();
      await expect(browser.locator(".chat-title b .tt")).toHaveText("Bilal Journey");
      await screen.getByRole("button", "Bilal, Cora", { exact: true }).tap();
      await expect(browser.locator(".chat-title b .tt")).toHaveText("Bilal, Cora");
      await expect(browser.locator("[role=log] p").last()).toHaveText(newest);
      expect(
        await browser.evaluate(() => {
          const log = document.querySelector('[role="log"]');
          if (!(log instanceof HTMLElement)) throw new Error("Missing message log");
          return {
            overflowing: log.scrollHeight > log.clientHeight,
            latest: log.scrollTop + log.clientHeight >= log.scrollHeight - 1,
          };
        }),
      ).toEqual({ overflowing: true, latest: true });

      await screen.getByRole("button", "Account", { exact: true }).tap();
      await screen.getByRole("button", "Sign out", { exact: true }).tap();
      await app.open(new URL(link).pathname);
      await expect(screen.getByRole("button", "Email me a code")).toBeVisible();
      expect(await surface.page().locator('meta[name="referrer"]').getAttribute("content")).toBe(
        "no-referrer",
      );
      await screen.getByRole("button", "Continue with Google", { exact: true }).tap();
      await surface.page().waitForURL((url) => url.origin !== "http://localhost:3000");
      // Follow the real error route used when the OAuth provider fails or is cancelled.
      await app.open("/auth/error");
      await surface.page().waitForURL((url) => url.pathname === new URL(link).pathname);
      await expect(browser.locator(".toast")).toHaveText("Sign-in wasn't completed. Try again.");
      expect(new URL(await browser.url()).pathname).toBe(new URL(link).pathname);
      await signUp("d", "Dalia Journey");
      await expect(screen.getByRole("heading", "Join Launch", { exact: true })).toBeVisible();
      expect(new URL(await browser.url()).pathname).toBe(new URL(link).pathname);
      await expect(browser.locator(".center p")).toHaveText([
        "3 members",
        "Join to read and write in this group.",
      ]);
      await expectMainFullWidth();
      await app.screenshot("j2-06-join-open");
      await screen.getByRole("button", "Join group", { exact: true }).tap();
      await expect(browser.locator("[role=log] .sys").last()).toHaveText("Dalia joined");
      expect(await surface.page().evaluate(() => sessionStorage.getItem("q9.join-return"))).toBe(
        null,
      );
      await app.open(new URL(link).pathname);
      await expect(browser.locator(".chat-title b .tt")).toHaveText("Launch");
      await expect(screen.getByRole("button", "Join group", { exact: true })).toHaveCount(0);
      await expect(browser.locator("[role=log] .sys").last()).toHaveText("Dalia joined");
      await expectMainFullWidth();
      await app.screenshot("j2-07-joined");
      clients.push(await clientFor(surface.context()));
      const d = required(
        (await a.query(api.people.find, { query: email("d") }))[0],
        "Missing newly joined Dalia",
      );
      await a.mutation(api.groups.removeMember, { groupId: launch.groupId, profileId: d.id });
      await app.open(new URL(link).pathname);
      await expect(browser.locator(".center p")).toHaveText(
        "You were removed from this group. Ask a member to add you back.",
      );
      await expectMainFullWidth();
      await app.screenshot("j2-08-join-removed");
      await app.open("/join/thisTokenIsNotReal123");
      await expect(browser.locator(".center p")).toHaveText("This invite link isn't valid.");
      await expectMainFullWidth();
      await app.screenshot("j2-09-join-invalid");
      await app.open("/join/abc");
      await expect(browser.locator(".center p")).toHaveText("This invite link isn't valid.");
    } finally {
      try {
        const results = await Promise.allSettled(
          clients.map((client) => client.mutation(api.profiles.deleteAccount, {})),
        );
        expect(results.map((result) => result.status)).toEqual(clients.map(() => "fulfilled"));
      } finally {
        await Promise.all([bContext.close(), cContext.close()]);
        await Promise.all(["a", "b", "c", "d"].map((person) => removeTestUser(email(person))));
      }
    }
  },
);
