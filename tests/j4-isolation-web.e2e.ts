import { surfaceOf, test } from "@e2e-dev/web";
import { api } from "@q9chat/convex";
import { expect } from "e2e";
import { Schema } from "effect";

import { browserEngine, signInDevAccount } from "./support/browser.js";
import { sendWire } from "./support/send-wire.js";
import { magicCode, removeTestUser } from "./support/workos.js";

async function fixture() {
  const surface = surfaceOf(browserEngine);
  if (!surface) throw new Error("Missing live browser");
  const page = surface.page();
  const context = surface.context();
  const engine = context.browser();
  if (!engine) throw new Error("Missing browser engine");
  const peer = await engine.newContext();
  const stamp = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  const emails = [
    `q9-j4-isolation-a-${stamp}@example.net`,
    `q9-j4-isolation-b-${stamp}@example.net`,
  ];
  const aEmail = emails[0];
  const bEmail = emails[1];
  if (!aEmail || !bEmail) throw new Error("Missing fixture email");
  const a = await signInDevAccount(context, aEmail, "Amira Isolation");
  const b = await signInDevAccount(peer, bEmail, "Bilal Isolation");
  const groupId = await a.client.mutation(api.groups.create, {
    name: "Isolation conversation",
    memberIds: [b.id],
    inviteToken: crypto.randomUUID().replaceAll("-", ""),
  });
  const path = `http://localhost:3000/?group=${groupId}`;
  const field = page.getByRole("textbox", { name: "Message", exact: true });
  const posts = () =>
    a.client.query(api.messages.range, { groupId, fromSequence: 1, toSequence: 100 });
  async function onePost(body: string) {
    const matching = async () =>
      (await posts()).filter((row) => row.kind === "post" && row.body === body);
    await expect.poll(async () => (await matching()).length).toBe(1);
    const [post] = await matching();
    if (!post || post.kind !== "post") throw new Error("Missing unique committed post");
    return post;
  }
  async function newTab() {
    const tab = await context.newPage();
    await tab.goto(path, { waitUntil: "commit" });
    const other = tab.getByRole("textbox", { name: "Message", exact: true });
    await other.waitFor();
    return { tab, other };
  }
  async function seedPosts(count: number, prefix: string) {
    for (let from = 0; from < count; from += 5) {
      await Promise.all(
        Array.from({ length: Math.min(5, count - from) }, (_, index) =>
          b.client.mutation(
            api.messages.send,
            {
              groupId,
              body: `${prefix} ${from + index}`,
              clientKey: crypto.randomUUID(),
              attachments: [],
            },
            { skipQueue: true },
          ),
        ),
      );
    }
  }
  async function open() {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(path, { waitUntil: "commit" });
    await field.waitFor();
    await page.locator('[role=log][aria-busy="false"]').waitFor();
  }
  async function signIn(email: string) {
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByRole("button", { name: "Email me a code", exact: true }).click();
    await page.getByLabel("Digit 1", { exact: true }).fill(await magicCode(email));
    await page
      .getByRole("heading", { name: "Check your email", exact: true })
      .waitFor({ state: "detached" });
  }
  async function signOut() {
    await page.getByRole("button", { name: "Account", exact: true }).click();
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await page.getByLabel("Email", { exact: true }).waitFor();
  }
  async function cleanup() {
    const deleted = await Promise.allSettled([
      a.client.mutation(api.profiles.deleteAccount, {}),
      b.client.mutation(api.profiles.deleteAccount, {}),
    ]);
    const resources = await Promise.allSettled([peer.close(), ...emails.map(removeTestUser)]);
    expect(
      [...deleted, ...resources].flatMap((result) =>
        result.status === "rejected" ? [String(result.reason)] : [],
      ),
    ).toEqual([]);
  }
  return {
    page,
    context,
    peer,
    a,
    b,
    groupId,
    path,
    field,
    posts,
    onePost,
    newTab,
    seedPosts,
    open,
    signIn,
    signOut,
    aEmail,
    bEmail,
    cleanup,
  };
}

function isolationTest(
  name: string,
  run: (f: Awaited<ReturnType<typeof fixture>>) => Promise<void>,
) {
  test(name, { timeout: 180_000 }, async ({ app }) => {
    await app.open("/");
    const f = await fixture();
    process.stdout.write(`J4 CASE READY: ${name}\n`);
    try {
      await run(f);
    } finally {
      await f.cleanup();
    }
  });
}

isolationTest("J4 account transport: disconnected A never replays as B", async (f) => {
  const pageErrors: string[] = [];
  f.page.on("pageerror", (error) => pageErrors.push(error.message));
  f.page.on("console", (message) => {
    if (
      message.type() === "error" &&
      message.text().includes("ConvexReactClient has already been closed")
    )
      pageErrors.push(message.text());
  });
  let blocked = false;
  const connections = new Set<() => Promise<void>>();
  await f.page.routeWebSocket("wss://quixotic-crab-23.convex.cloud/**", async (socket) => {
    if (blocked) {
      await socket.close({ code: 1012, reason: "J4 socket outage" });
      return;
    }
    const server = socket.connectToServer();
    const disconnect = async () => {
      await server.close();
      await socket.close({ code: 1012, reason: "J4 socket outage" });
    };
    connections.add(disconnect);
    socket.onClose(() => connections.delete(disconnect));
  });
  await f.open();
  blocked = true;
  await Promise.all([...connections].map((disconnect) => disconnect()));
  await f.field.fill("A private queued composition");
  await f.field.press("Enter");
  await f.page.getByText("Sending", { exact: true }).waitFor();
  const originalKey = await f.page.evaluate(
    (prefix) =>
      Object.keys(localStorage)
        .find((key) => key.startsWith(`${prefix}:pending:`))
        ?.split(":")
        .at(-1),
    `q9chat:text:${f.a.id}:${f.groupId}`,
  );
  if (typeof originalKey !== "string") throw new Error("Missing original outbox key");
  expect(
    (await f.posts()).filter(
      (row) => row.kind === "post" && row.body === "A private queued composition",
    ),
  ).toEqual([]);
  await f.signOut();
  await f.signIn(f.bEmail);
  blocked = false;
  await f.field.waitFor();
  await f.field.fill("B reconnect sentinel");
  await f.field.press("Enter");
  await expect
    .poll(async () =>
      (await f.posts()).some((row) => row.kind === "post" && row.body === "B reconnect sentinel"),
    )
    .toBe(true);
  expect(
    (await f.posts()).filter(
      (row) => row.kind === "post" && row.body === "A private queued composition",
    ),
  ).toEqual([]);
  expect(await f.page.getByRole("button", { name: "Retry", exact: true }).count()).toBe(0);
  await f.signOut();
  await f.signIn(f.aEmail);
  await f.page.getByRole("button", { name: "Retry", exact: true }).waitFor();
  await f.page.getByRole("button", { name: "Retry", exact: true }).focus();
  await f.page.keyboard.press("Enter");
  const ownPost = await f.onePost("A private queued composition");
  expect(ownPost.author.id).toBe(f.a.id);
  expect(ownPost.clientKey).toBe(originalKey);
  expect(pageErrors).toEqual([]);
  process.stdout.write(
    "J4 PASS: socket-blocked A switches to B through HTTP auth; no replay as B; A returns to one retryable original key\n",
  );
});

isolationTest("J4 tab drafts: one restored composition cannot become two posts", async (f) => {
  await f.open();
  await f.field.fill("Only tab A owns this composition");
  const { tab, other } = await f.newTab();
  try {
    // The second tab must not acquire a second sendable copy of A's composition.
    const restored = await other.inputValue();
    await f.field.press("Enter");
    await other.press("Enter");
    await tab.locator(".msg.sending").waitFor({ state: "detached" });
    await expect
      .poll(
        async () =>
          (await f.posts()).filter(
            (row) => row.kind === "post" && row.body === "Only tab A owns this composition",
          ).length,
      )
      .toBe(1);
    expect(restored).toBe("");
    process.stdout.write(
      "J4 PASS: a new tab does not restore another tab's sendable draft; one composition makes one post\n",
    );
  } finally {
    await tab.close();
  }
});

isolationTest("J4 tab drafts: stale tab send cannot erase a newer draft", async (f) => {
  await f.open();
  await f.field.fill("Old tab A draft");
  const { tab, other } = await f.newTab();
  try {
    // Give B an independent old composition, even with deliberately isolated drafts.
    await other.fill("Old tab B draft");
    await f.field.fill("Newer unsent tab A draft");
    await other.press("Enter");
    await expect
      .poll(async () =>
        (await f.posts()).some((row) => row.kind === "post" && row.body === "Old tab B draft"),
      )
      .toBe(true);
    expect(await f.field.inputValue()).toBe("Newer unsent tab A draft");
    // Check the persisted composition before navigation, so a navigation timeout cannot
    // conceal the stale tab's write. Read either version's deliberate storage format.
    expect(
      await f.page.evaluate(
        (key) => sessionStorage.getItem(key) ?? localStorage.getItem(key),
        `q9chat:text:${f.a.id}:${f.groupId}:draft`,
      ),
    ).toBe("Newer unsent tab A draft");
  } finally {
    await tab.close();
  }
  // The interleaving is complete. Close its sender before the separate durability check.
  await f.page.bringToFront();
  const beforeReload = await f.page.evaluate(() => performance.timeOrigin);
  await f.page.reload({ waitUntil: "commit" });
  expect(await f.page.evaluate((previous) => performance.timeOrigin > previous, beforeReload)).toBe(
    true,
  );
  await f.field.waitFor();
  expect(await f.field.inputValue()).toBe("Newer unsent tab A draft");
  process.stdout.write(
    "J4 PASS: a stale tab send cannot erase another tab's newer draft; preserved after sender closes and a fresh-document reload\n",
  );
});

isolationTest(
  "J4 outbox recovery: one broken entry cannot discard a draft or valid retry",
  async (f) => {
    const key = `q9chat:text:${f.a.id}:${f.groupId}`;
    await f.page.evaluate((prefix) => {
      // Seed the saved draft in both versions' formats before this group has ever mounted.
      sessionStorage.setItem(`${prefix}:draft`, "Draft survives damaged outbox");
      localStorage.setItem(`${prefix}:draft`, "Draft survives damaged outbox");
      localStorage.setItem(
        `${prefix}:pending:valid-key`,
        JSON.stringify({
          clientKey: "valid-key",
          body: "Valid saved retry",
          createdAt: Date.now(),
          status: "sending",
        }),
      );
      localStorage.setItem(`${prefix}:pending:broken-key`, "{not json");
      localStorage.setItem(
        `${prefix}:pending:old-key`,
        JSON.stringify({ clientKey: "old-key", body: 5 }),
      );
    }, key);
    await f.open();
    await f.page.screenshot({ path: "artifacts/j4-text/outbox-recovery.png" });
    expect(await f.field.inputValue()).toBe("Draft survives damaged outbox");
    expect(await f.page.getByRole("button", { name: "Retry", exact: true }).count()).toBe(1);
    for (let reload = 0; reload < 2; reload++) {
      await f.page.reload({ waitUntil: "commit" });
      await f.field.waitFor();
      await f.page.locator('[role=log][aria-busy="false"]').waitFor();
      await f.page.getByRole("button", { name: "Retry", exact: true }).waitFor();
      if (reload === 0) await f.page.screenshot({ path: "artifacts/j4-text/outbox-recovery.png" });
      expect(await f.field.inputValue()).toBe("Draft survives damaged outbox");
      expect(await f.page.getByRole("button", { name: "Retry", exact: true }).count()).toBe(1);
      expect(await f.page.locator(".txt").filter({ hasText: "Valid saved retry" }).count()).toBe(1);
    }
    expect(
      await f.page.evaluate((prefix) => localStorage.getItem(`${prefix}:pending:broken-key`), key),
    ).toBe(null);
    expect(
      await f.page.evaluate(
        (prefix) => localStorage.getItem(`${prefix}:quarantine:broken-key`),
        key,
      ),
    ).toBe("{not json");
    await f.page.getByRole("button", { name: "Retry", exact: true }).focus();
    await f.page.keyboard.press("Enter");
    const restoredPost = await f.onePost("Valid saved retry");
    expect(restoredPost.clientKey).toBe("valid-key");
    process.stdout.write(
      "J4 PASS: malformed and old-schema entries quarantined independently; draft and valid same-key retry survive two reloads\n",
    );
  },
);

const Coverage = Schema.Struct({
  result: Schema.Array(
    Schema.Struct({
      url: Schema.String,
      functions: Schema.Array(
        Schema.Struct({
          functionName: Schema.String,
          ranges: Schema.Array(Schema.Struct({ count: Schema.Number })),
        }),
      ),
    }),
  ),
});

isolationTest(
  "J4 receipt: deleted post outside the loaded window never replays cached text",
  async (f) => {
    const wire = await sendWire(f.page);
    await f.open();
    const body = "Deleted outside the loaded window";
    wire.set("fail-committed");
    await f.field.fill(body);
    await f.field.press("Enter");
    await f.page.getByRole("button", { name: "Retry", exact: true }).waitFor();
    const post = (await f.posts()).find((row) => row.kind === "post" && row.body === body);
    if (!post || post.kind !== "post") throw new Error("Missing committed post to delete");
    await f.a.client.mutation(api.messages.remove, { messageId: post.id });
    await f.seedPosts(305, "Newer than deleted post");
    await f.a.client.mutation(api.readStates.markRead, { groupId: f.groupId, sequence: 308 });
    // A fresh view restores the durable retry without replaying the first view's held frames.
    const page = await f.context.newPage();
    await page.goto(f.path, { waitUntil: "commit" });
    await page.getByRole("textbox", { name: "Message", exact: true }).waitFor();
    const retry = page.getByRole("button", { name: "Retry", exact: true });
    await retry.waitFor();
    await page.locator('[role=log][aria-busy="false"]').waitFor();
    expect(
      await page.locator("[role=log] [data-sequence]").first().getAttribute("data-sequence"),
    ).toBe("201");
    expect(await page.locator(`[id="m-${post.id}"]`).count()).toBe(0);
    await retry.focus();
    await page.keyboard.press("Enter");
    await retry.waitFor({ state: "detached" });
    await expect.poll(() => page.locator(".txt").filter({ hasText: body }).count()).toBe(0);
    expect(
      (await f.posts()).filter((row) => row.id === post.id && row.kind === "deleted").length,
    ).toBe(1);
    expect(
      await page.evaluate(
        (prefix) =>
          Object.keys(localStorage).filter((key) => key.startsWith(`${prefix}:pending:`)).length,
        `q9chat:text:${f.a.id}:${f.groupId}`,
      ),
    ).toBe(0);
    await page.close();
    process.stdout.write(
      "J4 PASS: retry of an old deleted post outside the loaded window retires its receipt and never appends cached text\n",
    );
  },
);

isolationTest(
  "J4 render isolation: draft input and typing do not rebuild a full history window",
  async (f) => {
    await f.seedPosts(298, "Render fixture");
    // The first unread is in the middle page, so opening loads all three bounded pages.
    await f.a.client.mutation(api.readStates.markRead, { groupId: f.groupId, sequence: 150 });
    const opening = await f.a.client.query(api.groups.get, { groupId: f.groupId });
    expect(opening?.status === "member" ? opening.firstUnreadSequence : null).toBe(151);
    await f.open();
    await f.page.locator('[data-sequence="2"]').waitFor({ state: "attached" });
    await f.page.locator('[role=log][aria-busy="false"]').waitFor();
    expect(await f.page.locator("[role=log] .msg").count()).toBe(298);
    expect(await f.page.locator("[role=log] [data-sequence]").count()).toBe(300);
    const profiler = await f.context.newCDPSession(f.page);
    await profiler.send("Profiler.enable");
    await profiler.send("Profiler.startPreciseCoverage", { callCount: true, detailed: false });
    async function counts() {
      const coverage = Schema.decodeUnknownSync(Coverage)(
        await profiler.send("Profiler.takePreciseCoverage"),
      );
      return Object.fromEntries(
        ["historyMessages", "Timeline", "buildTimeline"].map((name) => [
          name,
          coverage.result
            .flatMap((script) => script.functions)
            .filter((fn) => fn.functionName === name)
            .reduce((total, fn) => total + (fn.ranges[0]?.count ?? 0), 0),
        ]),
      );
    }
    try {
      await counts();
      const witness = (
        await f.a.client.query(api.messages.range, {
          groupId: f.groupId,
          fromSequence: 3,
          toSequence: 3,
        })
      )[0];
      if (!witness || witness.kind !== "post")
        throw new Error("Missing render measurement control post");
      await f.b.client.mutation(api.messages.edit, {
        messageId: witness.id,
        body: "Render measurement positive control",
      });
      // A real changed row must exercise the measured functions, or zeros prove nothing.
      await f.page
        .locator(`[id="m-${witness.id}"] .txt`)
        .filter({ hasText: "Render measurement positive control" })
        .waitFor({ state: "attached" });
      const control = await counts();
      for (const calls of Object.values(control)) expect(calls > 0).toBe(true);
      // Focusing the editor can mark visible rows read. Settle that real network/layout
      // work before attributing later calls to draft keystrokes.
      await f.field.focus();
      const visible = await f.page.locator("[role=log]").evaluate((log) => {
        const bounds = log.getBoundingClientRect();
        return Math.max(
          ...Array.from(log.querySelectorAll<HTMLElement>(".msg[data-sequence]"))
            .filter((row) => {
              const rect = row.getBoundingClientRect();
              return rect.top < bounds.bottom && rect.bottom > bounds.top;
            })
            .map((row) => Number(row.dataset["sequence"])),
        );
      });
      await expect
        .poll(async () => {
          const group = await f.a.client.query(api.groups.get, { groupId: f.groupId });
          return group?.status === "member" && group.lastReadSequence >= visible;
        })
        .toBe(true);
      let quiet = 0;
      await expect
        .poll(
          async () => {
            const calls = await counts();
            quiet = Object.values(calls).every((count) => count === 0) ? quiet + 1 : 0;
            return quiet;
          },
          { timeout: 5000 },
        )
        .toBe(3);
      await f.field.fill("Draft measurement");
      const fill = await counts();
      await f.field.type(" first keyboard input");
      const firstKeys = await counts();
      await f.field.type(" thirty separate composer keystrokes");
      const draft = await counts();
      process.stdout.write(`J4 INPUT PHASES: ${JSON.stringify({ fill, firstKeys, draft })}\n`);
      await f.b.client.mutation(api.typing.start, { groupId: f.groupId });
      await f.page.getByText("Bilal is typing", { exact: true }).waitFor();
      await f.b.client.mutation(api.typing.stop, { groupId: f.groupId });
      await f.page.locator(".typing").waitFor({ state: "detached" });
      const typing = await counts();
      process.stdout.write(
        `J4 RENDER CALLS (298 posts, 2 events): ${JSON.stringify({ draft, typing })}\n`,
      );
      expect(draft).toEqual({ historyMessages: 0, Timeline: 0, buildTimeline: 0 });
      expect(typing).toEqual({ historyMessages: 0, Timeline: 0, buildTimeline: 0 });
    } finally {
      await profiler.send("Profiler.stopPreciseCoverage");
      await profiler.detach();
    }
    process.stdout.write(
      "J4 PASS: V8 call counts show steady-state draft keystrokes and peer typing perform no history projection, Timeline render, or timeline rebuild in a full bounded window; initial input is reported separately\n",
    );
  },
);
