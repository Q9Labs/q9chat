import { surfaceOf, test } from "@e2e-dev/web";
import { api } from "@q9chat/convex";
import { ConvexHttpClient } from "convex/browser";
import { expect } from "e2e";
import { Schema } from "effect";

import { browserEngine } from "./support/browser.js";
import { magicCode, removeTestUser } from "./support/workos.js";

type BrowserContext = ReturnType<NonNullable<ReturnType<typeof surfaceOf>>["context"]>;
const Session = Schema.Struct({ accessToken: Schema.String });
const origin = "http://localhost:3000";
const convexUrl = "https://quixotic-crab-23.convex.cloud";

test(
  "journey 3: unread, history, live activity, typing and post states",
  { timeout: 480_000 },
  async ({ app, browser, screen }) => {
    const surface = surfaceOf(browserEngine);
    if (!surface) throw new Error("Missing live e2e browser surface");
    const engine = surface.context().browser();
    if (!engine) throw new Error("Missing live browser");
    await app.open("/");
    const page = surface.page();
    const contexts: BrowserContext[] = [];
    const clients: ConvexHttpClient[] = [];
    const addresses: string[] = [];
    const stamp = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
    async function account(person: string, context: BrowserContext) {
      const email = `q9-j3-${person.toLowerCase()}-${stamp}@example.net`;
      addresses.push(email);
      const headers = { Origin: origin };
      expect(
        (
          await context.request.post(`${origin}/api/auth/email/start`, { headers, data: { email } })
        ).status(),
      ).toBe(200);
      expect(
        (
          await context.request.post(`${origin}/api/auth/email/verify`, {
            headers,
            data: { email, code: await magicCode(email), client: "web" },
          })
        ).status(),
      ).toBe(200);
      const response = await context.request.post(`${origin}/api/auth/token`, {
        headers,
        data: {},
      });
      expect(response.status()).toBe(200);
      const session = Schema.decodeUnknownSync(Session)(await response.json());
      const client = new ConvexHttpClient(convexUrl);
      client.setAuth(session.accessToken);
      const id = await client.action(api.profiles.setUp, { displayName: `${person} Journey` });
      clients.push(client);
      return { client, id };
    }
    async function shot(name: string) {
      await page.screenshot({ path: `artifacts/j3/${name}.png` });
    }
    async function bottom() {
      await page.locator("[role=log]").evaluate((el) => {
        el.scrollTop = el.scrollHeight;
      });
      await page.waitForFunction(() => {
        const el = document.querySelector("[role=log]");
        return el && el.scrollHeight - el.scrollTop - el.clientHeight <= 1;
      });
    }
    async function cleanup() {
      const failures = [];
      for (const client of clients) {
        try {
          await client.mutation(api.profiles.deleteAccount, {});
        } catch (error) {
          failures.push(error);
        }
      }
      await Promise.all(contexts.map((context) => context.close()));
      await Promise.all(addresses.map(removeTestUser));
      expect(failures.length).toBe(0);
      process.stdout.write(
        `J3 cleanup: ${clients.length} fresh profiles submitted to deleteAccount; WorkOS users removed; peer contexts closed\n`,
      );
    }
    try {
      await browser.setViewport({ width: 1280, height: 800 });
      await browser.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
      const a = await account("Amira", surface.context());
      const createPeer = async (name: string) => {
        const context = await engine.newContext();
        contexts.push(context);
        return account(name, context);
      };
      const b = await createPeer("Bilal");
      const c = await createPeer("Cora");
      const d = await createPeer("Dina");
      const groupId = await a.client.mutation(api.groups.create, {
        name: "Launch conversation",
        memberIds: [b.id, c.id, d.id],
        inviteToken: crypto.randomUUID().replaceAll("-", ""),
      });
      const elsewhere = await a.client.mutation(api.groups.create, {
        name: "Muted elsewhere",
        memberIds: [b.id],
        inviteToken: crypto.randomUUID().replaceAll("-", ""),
      });
      await a.client.mutation(api.groups.setNotify, { groupId: elsewhere, notify: "muted" });
      const send = (body: string) =>
        b.client.mutation(api.messages.send, {
          groupId,
          body,
          clientKey: crypto.randomUUID(),
          attachments: [],
        });
      async function seedHistory() {
        // More than two pages of genuine history, then a read boundary and exactly 30 incoming posts.
        for (let i = 1; i <= 220; i++) await send(`History ${i}`);
        const detail = await a.client.query(api.groups.get, { groupId });
        if (detail?.status !== "member") throw new Error("Missing member group");
        await a.client.mutation(api.readStates.markRead, {
          groupId,
          sequence: detail.lastSequence,
        });
        const unread: Awaited<ReturnType<typeof send>>[] = [];
        for (let i = 1; i <= 30; i++) {
          unread.push(await send(`Unread ${i}${i === 1 ? " @Amira" : ""}`));
          if (i === 15)
            await a.client.mutation(api.messages.send, {
              groupId,
              body: "My own post does not count",
              clientKey: crypto.randomUUID(),
              attachments: [],
            });
        }
        return unread;
      }
      const unread = await seedHistory();
      async function verifyReading() {
        await app.open("/");
        await expect(browser.locator(".list .row .badge:not(.at)")).toContainText("30");
        await page.getByText("Launch conversation", { exact: true }).first().click();
        await expect(browser.locator(".newline")).toHaveText("New since you last looked");
        const first = unread[0];
        if (!first) throw new Error("Missing unread post");
        const placement = await page.locator("[role=log]").evaluate((el, id) => {
          const divider = el.querySelector<HTMLElement>("[data-new]");
          const post = document.getElementById(`m-${id}`);
          if (!divider || !post) throw new Error("Missing unread divider/post");
          return {
            gap: divider.getBoundingClientRect().top - el.getBoundingClientRect().top,
            before: divider.nextElementSibling?.contains(post) ?? false,
            body: post.textContent,
          };
        }, first.messageId);
        expect(placement.before).toBe(true);
        expect(placement.body).toBe("Unread 1 @Amira");
        expect(Math.abs(placement.gap - 90) < 3).toBe(true);
        await shot("01-unread");
        await bottom();
        await page.waitForFunction(
          () => document.querySelectorAll(".list .row.sel .badge").length === 0,
        );
        await expect(browser.locator(".list .row.sel .badge")).toHaveCount(0);
        await expect(browser.locator(".list .row.sel .badge.at")).toHaveCount(0);
        for (let i = 0; i < 2; i++) {
          const before = await page.locator("[role=log] .msg").count();
          const anchor = await page.locator("[role=log]").evaluate((el) => {
            el.scrollTop = 0;
            const anchorNode = el.querySelector(".msg");
            if (!anchorNode) throw new Error("Missing history anchor");
            return { id: anchorNode.id, top: anchorNode.getBoundingClientRect().top };
          });
          await page.waitForFunction(
            (count) => document.querySelectorAll("[role=log] .msg").length > count,
            before,
          );
          expect((await page.locator("[role=log] .msg").count()) > before).toBe(true);
          const preserved = await page
            .locator(`[id="${anchor.id}"]`)
            .evaluate((node) => node.getBoundingClientRect().top);
          expect(Math.abs(preserved - anchor.top) < 3).toBe(true);
        }
        await expect(screen.getByRole("button", "Jump to latest", { exact: true })).toBeVisible();
        await shot("02-history");
        await screen.getByRole("button", "Jump to latest", { exact: true }).tap();
        await page.waitForFunction(() => {
          const el = document.querySelector("[role=log]");
          return el && el.scrollHeight - el.scrollTop - el.clientHeight <= 1;
        });
        await expect(browser.locator(".jump.on")).toHaveCount(0);
        const live = await send("A live arrival");
        await page.locator(`#m-${live.messageId}`).waitFor({ state: "visible" });
        await page.waitForFunction(() => {
          const el = document.querySelector("[role=log]");
          return el && el.scrollHeight - el.scrollTop - el.clientHeight <= 1;
        });
        await expect(browser.locator(".list .row.sel .badge")).toHaveCount(0);
        await b.client.mutation(api.messages.send, {
          groupId: elsewhere,
          body: "Activity elsewhere",
          clientKey: crypto.randomUUID(),
          attachments: [],
        });
        await expect(browser.locator(".list .row").first()).toContainText("Muted elsewhere");
        await expect(browser.locator(".list .row").first()).toContainText("1");
        await expect(browser.locator(".list .row:first-child .badge.qt")).toHaveText("1");
        await expect(browser.locator(".list .row:first-child .pills svg")).toHaveCount(1);
        await shot("03-muted");
      }
      await verifyReading();
      async function verifyTyping() {
        for (const [index, peer] of [b, c, d].entries()) {
          await peer.client.mutation(api.typing.start, { groupId });
          const text = ["Bilal is typing", "Bilal and Cora are typing", "3 people are typing"][
            index
          ];
          if (!text) throw new Error("Missing typing copy");
          await expect(browser.locator(".typing .tt")).toHaveText(text);
          await shot(`04-typing-${index + 1}`);
        }
        await page.waitForFunction(() => document.querySelector(".typing") === null, undefined, {
          timeout: 8000,
        });
        await expect(browser.locator(".typing")).toHaveCount(0);
      }
      await verifyTyping();
      const deleted = await send("Delete me");
      await b.client.mutation(api.messages.remove, { messageId: deleted.messageId });
      const edited = await send("Before edit");
      await b.client.mutation(api.messages.edit, {
        messageId: edited.messageId,
        body: "After edit",
      });
      await expect(browser.locator(`#m-${deleted.messageId} .bub`)).toHaveText("Message deleted");
      await expect(browser.locator(`#m-${edited.messageId} .ed`)).toHaveText("edited");
      await expect(browser.locator(`#m-${edited.messageId} .txt`)).toHaveText("After editedited");
      await bottom();
      await shot("05-post-states");
      const pair = await a.client.mutation(api.groups.openPair, { profileId: b.id });
      await app.open(`/?group=${pair}`);
      await expect(browser.locator(".chat-title b .tt")).toHaveText("Bilal Journey");
      await expect(browser.locator(".chat-title small")).toHaveCount(0);
      await expect(browser.locator("[role=log] .sys")).toHaveText(
        "This is the start of your group with Bilal",
      );
      await shot("06-pair");
      async function verifyCappedUnread() {
        const backlog = await a.client.mutation(api.groups.create, {
          name: "A larger unread backlog",
          memberIds: [b.id],
          inviteToken: crypto.randomUUID().replaceAll("-", ""),
        });
        let firstId = "";
        for (let i = 1; i <= 120; i++) {
          const post = await b.client.mutation(api.messages.send, {
            groupId: backlog,
            body: `Backlog ${i}`,
            clientKey: crypto.randomUUID(),
            attachments: [],
          });
          if (i === 1) firstId = post.messageId;
        }
        await app.open(`/?group=${backlog}`);
        await expect(browser.locator(".newline")).toHaveText("New since you last looked");
        const next = await page
          .locator(".newline")
          .evaluate(
            (divider, id) => divider.nextElementSibling?.querySelector(".msg")?.id === `m-${id}`,
            firstId,
          );
        expect(next).toBe(true);
      }
      await verifyCappedUnread();
    } finally {
      await cleanup();
    }
  },
);
