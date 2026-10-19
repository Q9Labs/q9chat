import { surfaceOf, test } from "@e2e-dev/web";
import { api, type Id } from "@q9chat/convex";
import type { ConvexHttpClient } from "convex/browser";
import { expect } from "e2e";
import { Schema } from "effect";

import { browserEngine, devClient, signInDevAccount } from "./support/browser.js";
import { removeTestUser } from "./support/workos.js";

type BrowserContext = ReturnType<NonNullable<ReturnType<typeof surfaceOf>>["context"]>;
const QueryChanges = Schema.Struct({
  type: Schema.Literal("ModifyQuerySet"),
  modifications: Schema.Array(
    Schema.Union(
      Schema.Struct({
        type: Schema.Literal("Add"),
        queryId: Schema.Number,
        udfPath: Schema.String,
        args: Schema.Array(Schema.Unknown),
      }),
      Schema.Struct({ type: Schema.Literal("Remove"), queryId: Schema.Number }),
    ),
  ),
});
const RangeRequest = Schema.Struct({
  groupId: Schema.String,
  fromSequence: Schema.Number,
  toSequence: Schema.Number,
});
const ServerPing = Schema.Struct({ type: Schema.Literal("Ping") });

test(
  "journey 3: unread, history, live activity, typing and post states",
  { timeout: 900_000 },
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
    const rangeRequests: (typeof RangeRequest.Type)[] = [];
    let connectionCount = 0;
    let holdResponses = false;
    const heldResponses: (string | Buffer)[] = [];
    let releaseResponses = () => {
      holdResponses = false;
    };
    await page.routeWebSocket("wss://quixotic-crab-23.convex.cloud/**", (socket) => {
      connectionCount++;
      const server = socket.connectToServer();
      const ranges = new Set<number>();
      socket.onMessage((message) => {
        const parsed: unknown = JSON.parse(message.toString());
        if (Schema.is(QueryChanges)(parsed)) {
          for (const change of parsed.modifications) {
            if (change.type === "Remove") ranges.delete(change.queryId);
            else if (change.udfPath === "messages:range") {
              ranges.add(change.queryId);
              rangeRequests.push(Schema.decodeUnknownSync(RangeRequest)(change.args[0]));
            }
          }
          currentSubscriptions = ranges.size;
          maximumSubscriptions = Math.max(maximumSubscriptions, ranges.size);
        }
        server.send(message);
      });
      server.onMessage((message) => {
        const parsed: unknown = JSON.parse(message.toString());
        if (holdResponses && !Schema.is(ServerPing)(parsed)) heldResponses.push(message);
        else socket.send(message);
      });
      releaseResponses = () => {
        holdResponses = false;
        for (const response of heldResponses.splice(0)) socket.send(response);
      };
    });
    await page.reload();
    const contexts: BrowserContext[] = [];
    const clients: { readonly client: ConvexHttpClient; readonly context: BrowserContext }[] = [];
    const addresses: string[] = [];
    const stamp = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
    async function account(person: string, context: BrowserContext) {
      const email = `q9-j3-${person.toLowerCase()}-${stamp}@example.net`;
      addresses.push(email);
      const result = await signInDevAccount(context, email, `${person} Journey`);
      clients.push({ client: result.client, context });
      return result;
    }
    async function shot(name: string) {
      await page.screenshot({ path: `artifacts/j3-round3/${name}.png` });
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

    const anchorOffset = (id: string) =>
      page.locator(`[id="${id}"]`).evaluate((node) => {
        const log = node.closest("[role=log]");
        if (!log) throw new Error("Missing log");
        return node.getBoundingClientRect().top - log.getBoundingClientRect().top;
      });

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
    const refreshClients = () =>
      Promise.all(clients.map(({ context, client }) => devClient(context, client)));
    async function cleanup() {
      const failures = [];
      for (const { client, context } of clients) {
        try {
          await devClient(context, client);
          await client.mutation(api.profiles.deleteAccount, {});
        } catch (error) {
          failures.push(error);
        }
      }
      await Promise.all(contexts.map((context) => context.close()));
      await Promise.all(addresses.map(removeTestUser));
      expect(
        failures.map((error) =>
          error instanceof Error ? error.message : "Unknown cleanup failure",
        ),
      ).toEqual([]);
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
      const deletedFirst = unread[0];
      if (!deletedFirst) throw new Error("Missing first unread post");
      await b.client.mutation(api.messages.remove, { messageId: deletedFirst.messageId });
      const afterDeletion = await a.client.query(api.groups.get, { groupId });
      expect(afterDeletion?.status === "member" && afterDeletion.firstUnreadSequence).toBe(
        deletedFirst.sequence,
      );
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
        expect(placement.body).toBe("Message deleted");
        expect(Math.abs(placement.gap - 90) < 3).toBe(true);
        await expect(browser.locator(`#m-${first.messageId} .bub`)).toHaveText("Message deleted");
        await expect(browser.locator(".arrival-announcement")).toHaveText("");
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
          const preserved = await anchorOffset(anchor.id);
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
        await expect(browser.locator(".arrival-announcement")).toHaveText("Bilal: A live arrival");
        await expect(browser.locator("[role=log]")).toHaveAttribute("aria-live", "off");
        const arrivalId = await page
          .locator(".arrival-announcement span")
          .getAttribute("data-arrival");
        const ownLive = await a.client.mutation(api.messages.send, {
          groupId,
          body: "A live own send",
          clientKey: crypto.randomUUID(),
          attachments: [],
        });
        await page.locator(`[data-sequence="${ownLive.sequence}"]`).waitFor();
        await expect(browser.locator(".arrival-announcement")).toHaveText("Bilal: A live arrival");
        expect(await page.locator(".arrival-announcement span").getAttribute("data-arrival")).toBe(
          arrivalId,
        );
        await page.waitForFunction(() => {
          const el = document.querySelector("[role=log]");
          return el && el.scrollHeight - el.scrollTop - el.clientHeight <= 1;
        });
        await expect(browser.locator(".list .row.sel .badge")).toHaveCount(0);
        await page.getByRole("button", { name: "New group", exact: true }).click();
        await page.getByRole("dialog").waitFor();
        const coveredPost = await send("Behind a modal");
        await page.locator(`#m-${coveredPost.messageId}`).waitFor({ state: "attached" });
        await expect(browser.locator(".list .row.sel .badge")).toHaveText("1");
        const coveredDetail = await a.client.query(api.groups.get, { groupId });
        expect(coveredDetail?.status === "member" && coveredDetail.firstUnreadSequence).toBe(
          coveredPost.sequence,
        );
        await page.getByRole("button", { name: "Cancel", exact: true }).click();
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
      const dinaPost = await d.client.mutation(api.messages.send, {
        groupId,
        body: "Before account deletion",
        clientKey: crypto.randomUUID(),
        attachments: [],
      });
      await page.locator(`#m-${dinaPost.messageId}`).waitFor();
      await page.getByRole("button", { name: "About Dina", exact: true }).first().click();
      await page.getByRole("dialog", { name: "Dina Journey", exact: true }).waitFor();
      await d.client.mutation(api.profiles.deleteAccount, {});
      clients.splice(
        clients.findIndex(({ client }) => client === d.client),
        1,
      );
      await page.getByRole("dialog", { name: "Deleted account", exact: true }).waitFor();
      expect(
        await page
          .getByRole("dialog")
          .getByRole("button", { name: "Message", exact: true })
          .count(),
      ).toBe(0);
      await page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).click();
      const pair = await a.client.mutation(api.groups.openPair, { profileId: b.id });
      await app.open(`/?group=${pair}`);
      await expect(browser.locator(".chat-title b .tt")).toHaveText("Bilal Journey");
      await expect(browser.locator(".chat-title small")).toHaveCount(0);
      await expect(browser.locator("[role=log] .sys")).toHaveText(
        "This is the start of your group with Bilal",
      );
      await shot("06-pair");
      async function verifyLiveCatchUp(backlog: Id<"groups">) {
        await refreshClients();
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
        // Cross a live page boundary, then repeat identical text: both are genuine arrivals.
        for (let index = 0; index < 99; index += 5)
          await Promise.all(
            Array.from({ length: Math.min(5, 99 - index) }, (_, offset) =>
              b.client.mutation(
                api.messages.send,
                {
                  groupId: backlog,
                  body: `Boundary padding ${index + offset}`,
                  clientKey: crypto.randomUUID(),
                  attachments: [],
                },
                { skipQueue: true },
              ),
            ),
          );
        await bottom();
        const repeatedBody = "The same live post ".repeat(8);
        const repeatArrival = () =>
          b.client.mutation(api.messages.send, {
            groupId: backlog,
            body: repeatedBody,
            clientKey: crypto.randomUUID(),
            attachments: [],
          });
        for (let attempt = 0; attempt < 2; attempt++) {
          const arrival = await repeatArrival();
          await expect(browser.locator(".arrival-announcement")).toHaveText(
            `Bilal: ${repeatedBody.slice(0, 100)}`,
          );
          await expect(browser.locator(".arrival-announcement span")).toHaveAttribute(
            "data-arrival",
            arrival.messageId,
          );
        }
        process.stdout.write(
          "J3 announcer: live page boundary and repeated text update distinct arrival nodes; 100-character limit verified\n",
        );
        const coraPost = await c.client.mutation(api.messages.send, {
          groupId: backlog,
          body: "Cora before the history slide",
          clientKey: crypto.randomUUID(),
          attachments: [],
        });
        await page.locator(`#m-${coraPost.messageId}`).waitFor();
        await page.getByRole("button", { name: "About Cora", exact: true }).first().click();
        await page.getByRole("dialog", { name: "Cora Journey", exact: true }).waitFor();
        const deliveryConnection = connectionCount;
        holdResponses = true;
        for (let index = 0; index < 305; index += 5)
          await Promise.all(
            Array.from({ length: 5 }, (_, offset) =>
              b.client.mutation(
                api.messages.send,
                {
                  groupId: backlog,
                  body: `Held catch-up ${index + offset}`,
                  clientKey: crypto.randomUUID(),
                  attachments: [],
                },
                { skipQueue: true },
              ),
            ),
          );
        const catchUp = await b.client.mutation(api.messages.send, {
          groupId: backlog,
          body: "Caught up after held delivery",
          clientKey: crypto.randomUUID(),
          attachments: [],
        });
        await expect.poll(() => heldResponses.length > 0).toBe(true);
        releaseResponses();
        const snapshot = () =>
          page.locator("[role=log]").evaluate((el) => ({
            top: el.scrollTop,
            height: el.scrollHeight,
            viewport: el.clientHeight,
            busy: el.getAttribute("aria-busy"),
            first: el.querySelector<HTMLElement>("[data-sequence]")?.dataset["sequence"],
            last: Array.from(el.querySelectorAll<HTMLElement>("[data-sequence]")).at(-1)?.dataset[
              "sequence"
            ],
          }));
        try {
          await page
            .locator(`#m-${catchUp.messageId}`)
            .waitFor({ state: "visible", timeout: 10000 });
        } finally {
          process.stdout.write(`J3 delivered window: ${JSON.stringify(await snapshot())}\n`);
        }
        await page.locator('[role=log][aria-busy="false"]').waitFor();
        expect(connectionCount).toBe(deliveryConnection);
        const catchUpPosition = await snapshot();
        process.stdout.write(`J3 catch-up position: ${JSON.stringify(catchUpPosition)}\n`);
        await page.waitForFunction(
          () => {
            const log = document.querySelector("[role=log]");
            return log && log.scrollHeight - log.scrollTop - log.clientHeight <= 1;
          },
          undefined,
          { timeout: 10000 },
        );
        expect(currentSubscriptions <= 3).toBe(true);
        await page.getByRole("dialog").waitFor({ state: "detached" });
        await expect
          .poll(async () => {
            const detail = await a.client.query(api.groups.get, { groupId: backlog });
            return detail?.status === "member" && detail.lastReadSequence >= catchUp.sequence;
          })
          .toBe(true);
        process.stdout.write("J3 author eviction: dialog closes and live read tracking resumes\n");
        process.stdout.write(
          "J3 bottom-pinned catch-up: 306 held arrivals replaced the obsolete anchor; latest visible\n",
        );
      }
      async function verifyCappedUnread() {
        await refreshClients();
        const backlog = await a.client.mutation(api.groups.create, {
          name: "A larger unread backlog",
          memberIds: [b.id],
          inviteToken: crypto.randomUUID().replaceAll("-", ""),
        });
        async function addCoraEvent() {
          await a.client.mutation(api.groups.addMembers, { groupId: backlog, profileIds: [c.id] });
          const snapshot = await a.client.query(api.groups.get, { groupId: backlog });
          if (snapshot?.status !== "member") throw new Error("Missing seeded history");
          return snapshot.lastSequence;
        }
        let eventSequence = 0;
        const posts: { readonly messageId: string; readonly sequence: number }[] = [];
        // Public backend mutations, batched to avoid 450 sequential network round trips.
        for (let from = 1; from <= 450; from += 5) {
          if (from === 246) eventSequence = await addCoraEvent();
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
        }
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
        // Extend beyond page 4 while it stays off-window, permitting reversal in both directions.
        for (let from = 0; from < 200; from += 5)
          await Promise.all(
            Array.from({ length: 5 }, (_, index) =>
              b.client.mutation(
                api.messages.send,
                {
                  groupId: backlog,
                  body: `Off-window ${from + index}`,
                  clientKey: crypto.randomUUID(),
                  attachments: [],
                },
                { skipQueue: true },
              ),
            ),
          );
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
        async function reversePendingSlide(direction: "older" | "newer") {
          const announcement = await page.locator(".arrival-announcement").textContent();
          holdResponses = true;
          await page.locator("[role=log]").evaluate((el, older) => {
            el.scrollTop = older ? 0 : el.scrollHeight;
          }, direction === "older");
          await page.locator('[role=log][aria-busy="true"]').waitFor();
          const anchor = await page.locator("[role=log]").evaluate(
            (el, { sequence, offset }) => {
              const node = el.querySelector<HTMLElement>(`[data-sequence="${sequence}"]`);
              if (!node) throw new Error("Missing outgoing-page post");
              el.scrollTop +=
                node.getBoundingClientRect().top - el.getBoundingClientRect().top - offset;
              const bounds = el.getBoundingClientRect();
              const visible = Array.from(el.querySelectorAll<HTMLElement>("[data-sequence]")).find(
                (item) => item.getBoundingClientRect().bottom > bounds.top,
              );
              if (!visible) throw new Error("Missing outgoing anchor");
              return {
                id: visible.id,
                offset: visible.getBoundingClientRect().top - bounds.top,
                sequence: Number(visible.dataset["sequence"]),
              };
            },
            {
              sequence: direction === "older" ? 450 : eventSequence,
              offset: direction === "older" ? 70 : -1,
            },
          );
          expect(
            direction === "older" ? anchor.sequence > 400 : anchor.sequence === eventSequence,
          ).toBe(true);
          if (direction === "newer")
            expect(await page.locator(`[id="${anchor.id}"].sys`).count()).toBe(1);
          // Let the browser dispatch the reversal scroll before releasing server delivery.
          await page.evaluate(
            () =>
              new Promise<void>((resolve) => {
                requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
              }),
          );
          await expect.poll(() => heldResponses.length > 0).toBe(true);
          releaseResponses();
          await page.locator('[role=log][aria-busy="false"]').waitFor();
          const offset = await anchorOffset(anchor.id);
          expect(Math.abs(offset - anchor.offset) <= 2).toBe(true);
          expect(currentSubscriptions <= 3).toBe(true);
          await expect(browser.locator(".arrival-announcement")).toHaveText(announcement ?? "");
          process.stdout.write(
            `J3 outgoing-page reversal ${direction}: before ${anchor.offset}px; after ${offset}px; delta ${Math.abs(offset - anchor.offset)}px\n`,
          );
        }
        await reversePendingSlide("older");
        await reversePendingSlide("newer");
        for (let i = 0; i < 2; i++) {
          await pageOlder();
          expect(currentSubscriptions <= 3).toBe(true);
        }
        holdResponses = true;
        const jump = page.getByRole("button", { name: "Jump to latest", exact: true });
        await jump.focus();
        await page.keyboard.press("Enter");
        expect(
          await page.locator("[role=log]").evaluate((el) => el === document.activeElement),
        ).toBe(true);
        await page.locator('[role=log][aria-busy="true"]').waitFor();
        await page.keyboard.press("Shift+Tab");
        const focus = await page.locator(":focus").getAttribute("aria-label");
        expect(focus !== null).toBe(true);
        await expect.poll(() => heldResponses.length > 0).toBe(true);
        releaseResponses();
        await page.locator('[role=log][aria-busy="false"]').waitFor();
        expect(await page.locator(":focus").getAttribute("aria-label")).toBe(focus);
        await expect(browser.locator("[role=log]")).toContainText("Off-window");
        await expect(browser.locator(".list .row.sel .badge")).toHaveCount(0);
        expect(maximumSubscriptions <= 3).toBe(true);
        expect(maximumSubscriptions).toBe(3);
        await verifyLiveCatchUp(backlog);
        process.stdout.write(
          `J3 subscriptions: 450 unread; opening ${openingSubscriptions}; maximum live messages.range subscriptions ${maximumSubscriptions}; cap 3; final ${currentSubscriptions}\n`,
        );
      }
      await verifyCappedUnread();
      async function verifyOwnOnlyHistory() {
        await refreshClients();
        const own = await a.client.mutation(api.groups.create, {
          name: "Own posts, no incoming unread",
          memberIds: [],
          inviteToken: crypto.randomUUID().replaceAll("-", ""),
        });
        for (let index = 0; index < 305; index += 5)
          await Promise.all(
            Array.from({ length: 5 }, (_, offset) =>
              a.client.mutation(
                api.messages.send,
                {
                  groupId: own,
                  body: `Own-only ${index + offset}`,
                  clientKey: crypto.randomUUID(),
                  attachments: [],
                },
                { skipQueue: true },
              ),
            ),
          );
        const detail = await a.client.query(api.groups.get, { groupId: own });
        if (detail?.status !== "member") throw new Error("Missing own-only group");
        expect(detail.firstUnreadSequence).toBe(null);
        expect(detail.lastReadSequence < detail.lastSequence).toBe(true);
        const before = rangeRequests.length;
        await app.open(`/?group=${own}`);
        await page.locator('[role=log][aria-busy="false"]').waitFor();
        await expect(browser.locator("[role=log]")).toContainText("Own-only 304");
        await expect(browser.locator(".newline")).toHaveCount(0);
        const requests = rangeRequests.slice(before).filter((request) => request.groupId === own);
        process.stdout.write(`J3 own-only wire ranges: ${JSON.stringify(requests)}\n`);
        // Development remounts can register the same range again; no other page may be read.
        const pages = [...new Set(requests.map(({ fromSequence }) => fromSequence))].toSorted(
          (left, right) => left - right,
        );
        expect(pages).toEqual([201, 301]);
        expect(
          requests.every(({ fromSequence, toSequence }) => toSequence === fromSequence + 99),
        ).toBe(true);
        expect(currentSubscriptions).toBe(2);
        process.stdout.write(
          "J3 own-only history: 305 posts, no unread divider, exactly 2 distinct range pages, 2 live subscriptions, no page walk\n",
        );
      }
      await verifyOwnOnlyHistory();
      async function verifyCappedEvent() {
        const additional = [];
        for (const name of ["Eli", "Faye", "Gus", "Hana", "Ivan"])
          additional.push(await createPeer(name));
        const capped = await a.client.mutation(api.groups.create, {
          name: "Capped member event",
          memberIds: [b.id, c.id, ...additional.map((peer) => peer.id)],
          inviteToken: crypto.randomUUID().replaceAll("-", ""),
        });
        await app.open(`/?group=${capped}`);
        await expect(browser.locator("[role=log] .sys").last()).toHaveText(
          "You added Bilal, Cora, Eli and 4 others",
        );
      }
      await verifyCappedEvent();
    } finally {
      releaseResponses();
      await cleanup();
    }
  },
);
