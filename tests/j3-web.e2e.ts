import { surfaceOf, test } from "@e2e-dev/web";
import { api } from "@q9chat/convex";
import type { ConvexHttpClient } from "convex/browser";
import { expect } from "e2e";
import { Schema } from "effect";

import { browserEngine, devClient } from "./support/browser.js";
import { magicCode, removeTestUser } from "./support/workos.js";

type BrowserContext = ReturnType<NonNullable<ReturnType<typeof surfaceOf>>["context"]>;
const QueryChanges = Schema.Struct({
  type: Schema.Literal("ModifyQuerySet"),
  modifications: Schema.Array(
    Schema.Union(
      Schema.Struct({
        type: Schema.Literal("Add"),
        queryId: Schema.Number,
        udfPath: Schema.String,
      }),
      Schema.Struct({ type: Schema.Literal("Remove"), queryId: Schema.Number }),
    ),
  ),
});
const origin = "http://localhost:3000";

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
    // Count the actual Convex wire subscriptions, not rendered messages or query declarations.
    let maximumSubscriptions = 0;
    let currentSubscriptions = 0;
    let holdResponses = false;
    const heldResponses: (string | Buffer)[] = [];
    let releaseResponses = () => {
      holdResponses = false;
    };
    await page.routeWebSocket("wss://quixotic-crab-23.convex.cloud/**", (socket) => {
      const server = socket.connectToServer();
      const ranges = new Set<number>();
      socket.onMessage((message) => {
        const parsed: unknown = JSON.parse(message.toString());
        if (Schema.is(QueryChanges)(parsed)) {
          for (const change of parsed.modifications) {
            if (change.type === "Remove") ranges.delete(change.queryId);
            else if (change.udfPath === "messages:range") ranges.add(change.queryId);
          }
          currentSubscriptions = ranges.size;
          maximumSubscriptions = Math.max(maximumSubscriptions, ranges.size);
        }
        server.send(message);
      });
      server.onMessage((message) => {
        if (holdResponses) heldResponses.push(message);
        else socket.send(message);
      });
      releaseResponses = () => {
        holdResponses = false;
        for (const response of heldResponses.splice(0)) socket.send(response);
      };
    });
    await page.reload();
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
      const client = await devClient(context);
      clients.push(client);
      const id = await client.action(api.profiles.setUp, { displayName: `${person} Journey` });
      return { client, id };
    }
    async function shot(name: string) {
      await page.screenshot({ path: `artifacts/j3-round2/${name}.png` });
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
    const anchorAt = (top: number) =>
      page.locator("[role=log]").evaluate((el, scrollTop) => {
        el.scrollTop = scrollTop;
        const bounds = el.getBoundingClientRect();
        const node = Array.from(el.querySelectorAll(".msg")).find(
          (message) => message.getBoundingClientRect().bottom > bounds.top,
        );
        if (!node) throw new Error("Missing history anchor");
        return { id: node.id, offset: node.getBoundingClientRect().top - bounds.top };
      }, top);

    async function pageOlder() {
      const first = await page.locator("[role=log] .msg").first().getAttribute("id");
      await page.locator("[role=log]").evaluate((el) => {
        el.scrollTop = 0;
      });
      await page.waitForFunction(
        (id) => document.querySelector("[role=log] .msg")?.id !== id,
        first,
      );
      await page.locator('[role=log][aria-busy="false"]').waitFor();
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
        b.client.mutation(
          api.messages.send,
          {
            groupId,
            body,
            clientKey: crypto.randomUUID(),
            attachments: [],
          },
          { skipQueue: true },
        );
      async function seedHistory() {
        // More than two pages of genuine history, then a read boundary and exactly 30 incoming posts.
        for (let from = 1; from <= 420; from += 5)
          await Promise.all(
            Array.from({ length: 5 }, (_, index) => send(`History ${from + index}`)),
          );
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
          const firstId = await page.locator("[role=log] .msg").first().getAttribute("id");
          // Hold server delivery so the older-page result and peer arrival overlap the same prepend.
          holdResponses = true;
          let anchor = await anchorAt(0);
          await page.locator('[role=log][aria-busy="true"]').waitFor();
          if (i === 1) anchor = await anchorAt(300);
          await send(`Concurrent arrival ${i}`);
          // Deliver the pending history response only after the peer mutation has completed.
          await expect.poll(() => heldResponses.length > 0).toBe(true);
          releaseResponses();
          await page.waitForFunction((id) => {
            const log = document.querySelector('[role=log][aria-busy="false"]');
            return log && log.querySelector(".msg")?.id !== id;
          }, firstId);
          const preserved = await page.locator(`[id="${anchor.id}"]`).evaluate((node) => {
            const log = node.closest("[role=log]");
            if (!log) throw new Error("Missing log");
            return node.getBoundingClientRect().top - log.getBoundingClientRect().top;
          });
          expect(Math.abs(preserved - anchor.offset) <= 2).toBe(true);
          process.stdout.write(
            `J3 concurrent prepend ${i + 1}: anchor delta ${Math.abs(preserved - anchor.offset)}px\n`,
          );
        }
        await expect(screen.getByRole("button", "Jump to latest", { exact: true })).toBeVisible();
        await shot("02-history");
        await page.getByRole("button", { name: "Jump to latest", exact: true }).focus();
        await page.keyboard.press("Enter");
        await page.waitForFunction(() => document.activeElement?.getAttribute("role") === "log");
        expect(
          await page.locator("[role=log]").evaluate((el) => document.activeElement === el),
        ).toBe(true);
        await page.waitForFunction(() => {
          const el = document.querySelector("[role=log]");
          return el && el.scrollHeight - el.scrollTop - el.clientHeight <= 1;
        });
        await expect(browser.locator(".jump.on")).toHaveCount(0);
        const beforePageUp = await page.locator("[role=log]").evaluate((el) => el.scrollTop);
        await page.keyboard.press("PageUp");
        await page.waitForFunction((before) => {
          const log = document.querySelector("[role=log]");
          return log && log.scrollTop < before;
        }, beforePageUp);
        expect(
          await page
            .locator("[role=log]")
            .evaluate((el) => el.scrollTop < el.scrollHeight - el.clientHeight),
        ).toBe(true);
        await bottom();
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
        await page.getByText("Muted elsewhere", { exact: true }).first().click();
        await expect(browser.locator(".chat-title")).toHaveAttribute(
          "aria-label",
          "Group info for Muted elsewhere, muted",
        );
        await expect(browser.locator(".chat-title svg")).toHaveCount(1);
        expect(await page.locator(".chat-title svg").innerHTML()).toBe(
          await page.locator(".list .row.sel .pills svg").innerHTML(),
        );
        await expect(browser.locator("[role=log] .txt")).toHaveText("Activity elsewhere");
        await shot("03-muted-open");
        await page.getByText("Launch conversation", { exact: true }).first().click();
        await page.locator("[role=log]").waitFor();
        await bottom();
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
          await expect(browser.locator("[role=log] output")).toHaveCount(0);
          await page.waitForFunction(() => {
            const log = document.querySelector("[role=log]");
            const last = Array.from(log?.querySelectorAll(".msg") ?? []).at(-1);
            return (
              log &&
              last &&
              last.getBoundingClientRect().bottom <= log.getBoundingClientRect().bottom + 1
            );
          });
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
        const posts: { readonly messageId: string; readonly sequence: number }[] = [];
        // Public backend mutations, batched to avoid 450 sequential network round trips.
        for (let from = 1; from <= 450; from += 5)
          posts.push(
            ...(await Promise.all(
              Array.from({ length: 5 }, (_, index) =>
                b.client.mutation(
                  api.messages.send,
                  {
                    groupId: backlog,
                    body: `Backlog ${from + index}`,
                    clientKey: crypto.randomUUID(),
                    attachments: [],
                  },
                  { skipQueue: true },
                ),
              ),
            )),
          );
        const first = posts.toSorted((left, right) => left.sequence - right.sequence)[0];
        if (!first) throw new Error("Missing backlog seed");
        await app.open(`/?group=${backlog}`);
        await expect(browser.locator(".newline")).toHaveText("New since you last looked");
        expect(
          await page
            .locator(".newline")
            .evaluate(
              (divider, id) => divider.nextElementSibling?.querySelector(".msg")?.id === `m-${id}`,
              first.messageId,
            ),
        ).toBe(true);
        const openingSubscriptions = currentSubscriptions;
        expect(openingSubscriptions).toBe(2);
        const away = await b.client.mutation(api.messages.send, {
          groupId: backlog,
          body: "Not loaded while reading older history",
          clientKey: crypto.randomUUID(),
          attachments: [],
        });
        await expect(browser.locator(".list .row.sel")).toContainText(
          "Not loaded while reading older history",
        );
        await expect(browser.locator(`#m-${away.messageId}`)).toHaveCount(0);
        await expect(browser.locator(".jump.on")).toHaveCount(1);
        for (let i = 0; i < 3; i++) {
          const last = await page.locator("[role=log] .msg").last().getAttribute("id");
          await page.locator("[role=log]").evaluate((el) => {
            el.scrollTop = el.scrollHeight;
          });
          await page.waitForFunction(
            (id) => Array.from(document.querySelectorAll("[role=log] .msg")).at(-1)?.id !== id,
            last,
          );
          await page.locator('[role=log][aria-busy="false"]').waitFor();
          expect(currentSubscriptions <= 3).toBe(true);
        }
        for (let i = 0; i < 2; i++) {
          await pageOlder();
          expect(currentSubscriptions <= 3).toBe(true);
        }
        await page.getByRole("button", { name: "Jump to latest", exact: true }).click();
        await page.locator(`#m-${away.messageId}`).waitFor({ state: "visible" });
        await expect(browser.locator(".list .row.sel .badge")).toHaveCount(0);
        expect(maximumSubscriptions <= 3).toBe(true);
        expect(maximumSubscriptions).toBe(3);
        async function verifyShortLatestPage() {
          // A fully read conversation whose latest page has just one post must still scroll to older history.
          await app.open(`/?group=${pair}`);
          const beforeTail = await a.client.query(api.groups.get, { groupId: backlog });
          if (beforeTail?.status !== "member") throw new Error("Missing backlog");
          const tailSequence = (Math.floor(beforeTail.lastSequence / 100) + 1) * 100 + 1;
          const remaining = tailSequence - beforeTail.lastSequence;
          for (let from = 0; from < remaining; from += 5)
            await Promise.all(
              Array.from({ length: Math.min(5, remaining - from) }, (_, index) =>
                b.client.mutation(
                  api.messages.send,
                  {
                    groupId: backlog,
                    body: `Tail context ${from + index}`,
                    clientKey: crypto.randomUUID(),
                    attachments: [],
                  },
                  { skipQueue: true },
                ),
              ),
            );
          await a.client.mutation(api.readStates.markRead, {
            groupId: backlog,
            sequence: tailSequence,
          });
          await app.open(`/?group=${backlog}`);
          await expect(browser.locator(".newline")).toHaveCount(0);
          await expect(browser.locator("[role=log] .msg")).toHaveCount(101);
          expect(
            await page.locator("[role=log]").evaluate((el) => el.scrollHeight > el.clientHeight),
          ).toBe(true);
          await pageOlder();
          await page.getByRole("button", { name: "Jump to latest", exact: true }).click();
          await page.waitForFunction(() => document.activeElement?.getAttribute("role") === "log");
          await page.locator('[role=log][aria-busy="false"]').waitFor();
          expect(maximumSubscriptions).toBe(3);
          process.stdout.write(
            `J3 short latest page: 101 rendered posts, older history reachable\n`,
          );
        }
        await verifyShortLatestPage();
        process.stdout.write(
          `J3 subscriptions: 450 unread; opening ${openingSubscriptions}; maximum live messages.range subscriptions ${maximumSubscriptions}; cap 3; final ${currentSubscriptions}\n`,
        );
      }
      await verifyCappedUnread();
      async function verifyCappedEvent() {
        const additional = [];
        for (const name of ["Eli", "Faye", "Gus", "Hana"]) additional.push(await createPeer(name));
        const capped = await a.client.mutation(api.groups.create, {
          name: "Capped member event",
          memberIds: [b.id, c.id, d.id, ...additional.map((peer) => peer.id)],
          inviteToken: crypto.randomUUID().replaceAll("-", ""),
        });
        await app.open(`/?group=${capped}`);
        await expect(browser.locator("[role=log] .sys").last()).toHaveText(
          "You added Bilal, Cora, Dina and 4 others",
        );
      }
      await verifyCappedEvent();
    } finally {
      releaseResponses();
      await cleanup();
    }
  },
);
