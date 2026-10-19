import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { test } from "node:test";

import { Schema } from "effect";

import type { Store, StoreKey } from "../src/session/storage.ts";

// The real session client and the real Worker client run here. Only the outside edges are faked:
// fetch (the Worker), the keychain, and the system auth window.
process.env["EXPO_PUBLIC_CONVEX_URL"] = "https://example.convex.cloud";
process.env["EXPO_PUBLIC_AUTH_ORIGIN"] = "http://worker.test";
process.env["EXPO_PUBLIC_WORKOS_CLIENT_ID"] = "client_test";

const { createSessionClient } = await import("../src/session/core.ts");
const { SignInIncompleteError } = await import("../src/session/contracts.ts");

const RequestBody = Schema.Struct({
  refreshToken: Schema.optional(Schema.String),
  code: Schema.optional(Schema.String),
  codeVerifier: Schema.optional(Schema.String),
});
type Body = typeof RequestBody.Type;
const SavedAttempt = Schema.Struct({ state: Schema.String, expiresAt: Schema.Number });
const SavedEmail = Schema.Struct({ email: Schema.String, expiresAt: Schema.Number });
type Pending = {
  path: string;
  body: Body;
  signal: AbortSignal | null | undefined;
  reply: (response: Response | Error) => void;
};

const json = (body: object, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });

/** A 200 answer whose body never ends, until the request is aborted. */
const stalledBody = (signal: AbortSignal | null | undefined) =>
  new Response(
    new ReadableStream({
      start(controller) {
        signal?.addEventListener("abort", () => controller.error(signal.reason));
      },
    }),
  );

const phoneSession = (tag: string) => ({
  accessToken: `access-${tag}`,
  expiresAt: Date.now() + 3_600_000,
  user: { id: `user-${tag}`, email: `${tag}@example.net`, firstName: null, lastName: null },
  method: "email",
  refreshToken: `refresh-${tag}`,
});

const tick = () => new Promise((resolve) => setImmediate(resolve));
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** A stand-in Worker: a request waits for the test to answer it, unless an automatic answer is set. */
function createWorker() {
  const log: { path: string; body: Body; cookie: string | null }[] = [];
  const pending: Pending[] = [];
  const auto = new Map<string, (body: Body) => Response | Error>();
  globalThis.fetch = (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input);
    const path = url.pathname.replace("/api/auth/", "");
    const body = Schema.decodeUnknownSync(RequestBody)(
      JSON.parse(typeof init?.body === "string" ? init.body : "{}"),
    );
    log.push({ path, body, cookie: new Headers(init?.headers).get("cookie") });
    const signal = init?.signal;
    return new Promise<Response>((resolve, reject) => {
      const reply = (response: Response | Error) =>
        response instanceof Error ? reject(response) : resolve(response);
      if (signal?.aborted) return reject(signal.reason);
      signal?.addEventListener("abort", () => reject(signal.reason));
      const answer = auto.get(path);
      if (answer) reply(answer(body));
      else pending.push({ path, body, signal, reply });
    });
  };
  return {
    log,
    auto: (path: string, answer: (body: Body) => Response | Error) => auto.set(path, answer),
    next: async (path: string) => {
      for (let attempt = 0; attempt < 50; attempt += 1) {
        const index = pending.findIndex((request) => request.path === path);
        const [request] = index >= 0 ? pending.splice(index, 1) : [];
        if (request) return request;
        await tick();
      }
      throw new Error(`The client sent no ${path} request`);
    },
    count: (path: string) => log.filter((entry) => entry.path === path).length,
  };
}

/** A keychain that outlives clients: a restarted app is a new client on the same keychain. */
function createKeychain(initial: Partial<Record<StoreKey, string>>) {
  const values = new Map<string, string>(Object.entries(initial));
  let writeGate: Promise<void> | null = null;
  let readFails = false;
  let failingWrites: readonly StoreKey[] = [];
  const store: Store = {
    get: async (key) => {
      if (readFails) throw new Error("keychain unavailable");
      return values.get(key) ?? null;
    },
    set: async (key, value) => {
      await writeGate;
      if (failingWrites.includes(key)) throw new Error("keychain write failed");
      values.set(key, value);
    },
    delete: async (key) => {
      await writeGate;
      if (failingWrites.includes(key)) throw new Error("keychain write failed");
      values.delete(key);
    },
  };
  return {
    store,
    value: (key: StoreKey) => values.get(key) ?? null,
    /** Holds every write until the returned function runs, like a slow native storage call. */
    holdWrites() {
      const gate = Promise.withResolvers<void>();
      writeGate = gate.promise;
      return gate.resolve;
    },
    failReads(fails: boolean) {
      readFails = fails;
    },
    /** Writes and deletes of these keys reject, until the list is empty again. */
    failWrites(keys: readonly StoreKey[]) {
      failingWrites = keys;
    },
  };
}

type AuthWindow = {
  url: URL;
  finish: (result: { type: "success"; url: string } | { type: "closed" }) => void;
};

function harness(
  initial: Partial<Record<StoreKey, string>>,
  options: { requestTimeoutMs?: number } = {},
) {
  const worker = createWorker();
  const keychain = createKeychain(initial);
  const windows: AuthWindow[] = [];
  const clock = { skewMs: 0 };
  const authWindowBroken = { value: false };
  const create = () =>
    createSessionClient({
      store: keychain.store,
      openAuth: (url) =>
        authWindowBroken.value
          ? Promise.reject(new Error("the auth window could not open"))
          : new Promise((resolve) => {
              windows.push({ url: new URL(url), finish: resolve });
            }),
      randomBytes: (length) => randomBytes(length),
      sha256Base64: async (text) => createHash("sha256").update(text).digest("base64"),
      now: () => Date.now() + clock.skewMs,
      ...options,
    });
  worker.auto("oauth/exchange", (body) =>
    body.code
      ? json(phoneSession("oauth"))
      : json({}, 200, { "set-cookie": "q9_phone=transaction-1; Path=/; HttpOnly" }),
  );
  return {
    worker,
    keychain,
    client: create(),
    /** The app was killed and opened again: a new client, the same keychain. */
    restart: create,
    clock,
    /** From now on the system auth window fails to open. */
    breakAuthWindow: () => {
      authWindowBroken.value = true;
    },
    authWindow: async (index: number) => {
      for (let attempt = 0; attempt < 50 && !windows[index]; attempt += 1) await tick();
      const opened = windows[index];
      if (!opened) throw new Error(`Auth window ${index} never opened`);
      return opened;
    },
    returnLink: (opened: AuthWindow, code: string) =>
      `q9chat://auth/callback?code=${code}&state=${opened.url.searchParams.get("state")}`,
  };
}

type Client = ReturnType<typeof harness>["client"];
const statusOf = (client: Client) => client.snapshot().status;
const accessTokenOf = (client: Client) => {
  const state = client.snapshot();
  return state.status === "authenticated" ? state.session.accessToken : null;
};
const exchanges = (worker: ReturnType<typeof createWorker>) =>
  worker.log.filter((entry) => entry.body.code);

void test("a held refresh write, then sign-out, then another sign-in: the new account's token survives", async () => {
  const { worker, keychain, client } = harness({ refreshToken: "refresh-a" });
  const releaseWrite = keychain.holdWrites();
  const restoring = client.bootstrap();
  (await worker.next("token")).reply(json(phoneSession("a2")));
  await tick();

  const signingOut = client.signOut();
  worker.auto("email/verify", () => json(phoneSession("b")));
  const signingInAsB = client.verifyEmail("b@example.net", "123456");

  releaseWrite();
  const revoke = await worker.next("sign-out");
  assert.equal(revoke.body.refreshToken, "refresh-a2");
  revoke.reply(json({}));
  await Promise.all([restoring, signingOut, signingInAsB]);

  assert.equal(keychain.value("refreshToken"), "refresh-b");
  assert.equal(accessTokenOf(client), "access-b");
});

void test("signing out cancels the refresh in flight and revokes the token it was using", async () => {
  const { worker, keychain, client } = harness({ refreshToken: "refresh-a" });
  const starting = client.bootstrap();
  const refreshing = await worker.next("token");

  const signingOut = client.signOut();
  assert.equal(refreshing.signal?.aborted, true);
  const revoke = await worker.next("sign-out");
  assert.equal(revoke.body.refreshToken, "refresh-a");
  revoke.reply(json({}));
  await Promise.all([starting, signingOut]);
  assert.equal(statusOf(client), "unauthenticated");
  assert.equal(keychain.value("refreshToken"), null);
});

void test("a launch refresh that never answers goes offline with the token kept, and a late answer changes nothing", async () => {
  const { worker, keychain, client } = harness(
    { refreshToken: "refresh-a" },
    { requestTimeoutMs: 30 },
  );
  const starting = client.bootstrap();
  const stalled = await worker.next("token");
  await starting;
  assert.equal(statusOf(client), "offline");
  assert.equal(keychain.value("refreshToken"), "refresh-a");

  stalled.reply(json(phoneSession("late")));
  await pause(10);
  assert.equal(statusOf(client), "offline");
  assert.equal(keychain.value("refreshToken"), "refresh-a");

  const retrying = client.retry();
  (await worker.next("token")).reply(json(phoneSession("a2")));
  await retrying;
  assert.equal(accessTokenOf(client), "access-a2");
});

void test("the deadline covers the response body, not only the headers", async () => {
  const { worker, client } = harness({ refreshToken: "refresh-a" }, { requestTimeoutMs: 30 });
  const starting = client.bootstrap();
  const request = await worker.next("token");
  request.reply(stalledBody(request.signal));
  await starting;
  assert.equal(statusOf(client), "offline");
});

void test("the refresh token is read from the keychain on every refresh, not kept in memory", async () => {
  const { worker, keychain, client } = harness({ refreshToken: "refresh-a" });
  worker.auto("token", (body) =>
    json(phoneSession(body.refreshToken === "refresh-x" ? "x2" : "a2")),
  );
  await client.bootstrap();
  assert.equal(keychain.value("refreshToken"), "refresh-a2");

  await keychain.store.set("refreshToken", "refresh-x");
  await client.fetchAccessToken({ forceRefreshToken: true });
  const sent = worker.log
    .filter((entry) => entry.path === "token")
    .map((entry) => entry.body.refreshToken);
  assert.deepEqual(sent, ["refresh-a", "refresh-x"]);
});

void test("two refreshes asked for together share one request", async () => {
  const { worker, client } = harness({ refreshToken: "refresh-a" });
  worker.auto("token", () => json(phoneSession("a2")));
  const both = await Promise.all([
    client.fetchAccessToken({ forceRefreshToken: true }),
    client.fetchAccessToken({ forceRefreshToken: true }),
  ]);
  assert.deepEqual(both, ["access-a2", "access-a2"]);
  assert.equal(worker.count("token"), 1);
});

void test("a cold start without a connection keeps the token, says it is offline, and recovers on retry", async () => {
  const { worker, keychain, client } = harness({ refreshToken: "refresh-a" });
  const starting = client.bootstrap();
  (await worker.next("token")).reply(new TypeError("Network request failed"));
  await starting;
  assert.equal(statusOf(client), "offline");
  assert.equal(keychain.value("refreshToken"), "refresh-a");

  const retrying = client.retry();
  assert.equal(statusOf(client), "loading");
  (await worker.next("token")).reply(json(phoneSession("a2")));
  await retrying;
  assert.equal(accessTokenOf(client), "access-a2");
  assert.equal(keychain.value("refreshToken"), "refresh-a2");
});

void test("a server error keeps the token too; only a confirmed 401 signs the person out", async () => {
  const { worker, keychain, client } = harness({ refreshToken: "refresh-a" });
  const starting = client.bootstrap();
  (await worker.next("token")).reply(json({}, 503));
  await starting;
  assert.equal(statusOf(client), "offline");
  assert.equal(keychain.value("refreshToken"), "refresh-a");

  const retrying = client.retry();
  (await worker.next("token")).reply(json({ error: "session_expired" }, 401));
  await retrying;
  assert.equal(statusOf(client), "unauthenticated");
  assert.equal(keychain.value("refreshToken"), null);
});

void test("a keychain read failure at launch is offline and retryable, not signed out", async () => {
  const { worker, keychain, client } = harness({ refreshToken: "refresh-a" });
  keychain.failReads(true);
  await client.bootstrap();
  assert.equal(statusOf(client), "offline");

  keychain.failReads(false);
  const retrying = client.retry();
  (await worker.next("token")).reply(json(phoneSession("a2")));
  await retrying;
  assert.equal(accessTokenOf(client), "access-a2");
});

void test("retry does nothing unless the session is offline", async () => {
  const { worker, client } = harness({ refreshToken: "refresh-a" });
  worker.auto("token", () => json(phoneSession("a")));
  await client.bootstrap();
  await client.retry();
  assert.equal(worker.count("token"), 1);
  assert.equal(worker.count("sign-out"), 0);
});

void test("an OAuth attempt survives the app being killed: a new client finishes it from the deep link", async () => {
  const { worker, keychain, restart, clock, client, authWindow } = harness({});
  void client.startOAuth("google").catch(() => {});
  const opened = await authWindow(0);
  const state = opened.url.searchParams.get("state") ?? "";
  const saved = Schema.decodeUnknownSync(SavedAttempt)(
    JSON.parse(keychain.value("oauthAttempt") ?? "null"),
  );
  assert.equal(saved.state, state);
  assert.ok(
    saved.expiresAt > Date.now() + 9 * 60_000 && saved.expiresAt <= Date.now() + 10 * 60_000,
  );

  const restarted = restart();
  await restarted.finishOAuth({ code: "real", state });
  assert.equal(accessTokenOf(restarted), "access-oauth");
  assert.equal(keychain.value("refreshToken"), "refresh-oauth");
  assert.equal(keychain.value("oauthAttempt"), null);
  assert.equal(exchanges(worker).at(-1)?.cookie, "q9_phone=transaction-1");
  assert.equal(clock.skewMs, 0);

  await assert.rejects(restart().finishOAuth({ code: "real", state }), SignInIncompleteError);
  assert.equal(exchanges(worker).length, 1);
});

void test("a saved OAuth attempt expires after ten minutes, and the expired record is deleted when it is met", async () => {
  const { worker, keychain, restart, clock, client, authWindow } = harness({});
  void client.startOAuth("google").catch(() => {});
  const state = (await authWindow(0)).url.searchParams.get("state") ?? "";

  clock.skewMs = 10 * 60_000 + 1_000;
  const restarted = restart();
  await assert.rejects(restarted.finishOAuth({ code: "real", state }), SignInIncompleteError);
  assert.equal(exchanges(worker).length, 0);
  assert.equal(statusOf(restarted), "loading");
  assert.equal(keychain.value("oauthAttempt"), null);
});

void test("a link with the wrong state is refused and leaves the live attempt alone", async () => {
  const { worker, client, authWindow, returnLink } = harness({});
  const signingIn = client.startOAuth("google");
  const opened = await authWindow(0);
  await assert.rejects(
    client.finishOAuth({ code: "stolen", state: "wrong" }),
    SignInIncompleteError,
  );
  assert.equal(worker.count("oauth/exchange"), 1);

  opened.finish({ type: "success", url: returnLink(opened, "real") });
  await signingIn;
  assert.equal(accessTokenOf(client), "access-oauth");
  assert.equal(exchanges(worker).at(-1)?.body.code, "real");
});

void test("closing the auth window drops the saved attempt and lets the next one start", async () => {
  const { keychain, client, authWindow, returnLink } = harness({});
  const first = client.startOAuth("google");
  (await authWindow(0)).finish({ type: "closed" });
  await assert.rejects(first, SignInIncompleteError);
  assert.equal(keychain.value("oauthAttempt"), null);

  const second = client.startOAuth("google");
  const opened = await authWindow(1);
  opened.finish({ type: "success", url: returnLink(opened, "real") });
  await second;
  assert.equal(accessTokenOf(client), "access-oauth");
});

void test("a failed exchange drops the saved attempt", async () => {
  const { worker, keychain, client, authWindow, returnLink } = harness({});
  worker.auto("oauth/exchange", (body) => (body.code ? json({}, 500) : json({})));
  const signingIn = client.startOAuth("google");
  const opened = await authWindow(0);
  opened.finish({ type: "success", url: returnLink(opened, "real") });
  await assert.rejects(signingIn, SignInIncompleteError);
  assert.equal(keychain.value("oauthAttempt"), null);
});

void test("signing out drops a saved attempt, so a link delivered later is refused", async () => {
  const { worker, keychain, client, authWindow } = harness({});
  void client.startOAuth("google").catch(() => {});
  const state = (await authWindow(0)).url.searchParams.get("state") ?? "";

  worker.auto("sign-out", () => json({}));
  await client.signOut();
  assert.equal(keychain.value("oauthAttempt"), null);
  await assert.rejects(client.finishOAuth({ code: "real", state }), SignInIncompleteError);
  assert.equal(exchanges(worker).length, 0);
});

void test("a link delivered again after sign-out is refused and exchanges nothing", async () => {
  const { worker, client, authWindow, returnLink } = harness({});
  const signingIn = client.startOAuth("google");
  const opened = await authWindow(0);
  const state = opened.url.searchParams.get("state");
  opened.finish({ type: "success", url: returnLink(opened, "real") });
  await signingIn;

  worker.auto("sign-out", () => json({}));
  await client.signOut();
  await assert.rejects(
    client.finishOAuth({ code: "real", state: state ?? "" }),
    SignInIncompleteError,
  );
  assert.equal(statusOf(client), "unauthenticated");
  assert.equal(exchanges(worker).length, 1);
});

void test("a second start is refused while an attempt is live, and the first still finishes", async () => {
  const { client, authWindow, returnLink } = harness({});
  const first = client.startOAuth("google");
  const opened = await authWindow(0);
  await assert.rejects(client.startOAuth("apple"), SignInIncompleteError);

  opened.finish({ type: "success", url: returnLink(opened, "real") });
  await first;
  assert.equal(accessTokenOf(client), "access-oauth");
});

void test("an older auth window finishing after its replacement does not touch the new attempt", async () => {
  const { worker, client, authWindow, returnLink } = harness({});
  const older = client.startOAuth("google");
  const olderWindow = await authWindow(0);
  worker.auto("sign-out", () => json({}));
  // Signing out ends the live attempt, so a new one can start while the old window is still open.
  await client.signOut();
  const newer = client.startOAuth("apple");
  const newerWindow = await authWindow(1);

  olderWindow.finish({ type: "success", url: returnLink(olderWindow, "old-code") });
  await assert.rejects(older, SignInIncompleteError);
  assert.equal(statusOf(client), "unauthenticated");

  newerWindow.finish({ type: "success", url: returnLink(newerWindow, "new-code") });
  await newer;
  assert.equal(accessTokenOf(client), "access-oauth");
  assert.deepEqual(
    exchanges(worker).map((entry) => entry.body.code),
    ["new-code"],
  );
});

void test("the auth window and the deep-link route deliver the same link and share one exchange", async () => {
  const { worker, client, authWindow, returnLink } = harness({});
  const signingIn = client.startOAuth("google");
  const opened = await authWindow(0);
  const state = opened.url.searchParams.get("state") ?? "";

  const route = client.finishOAuth({ code: "real", state });
  opened.finish({ type: "success", url: returnLink(opened, "real") });
  await Promise.all([route, signingIn]);
  assert.equal(accessTokenOf(client), "access-oauth");
  assert.equal(exchanges(worker).length, 1);
});

const startsEmailWithCookie = (worker: ReturnType<typeof createWorker>) => {
  worker.auto("email/start", () =>
    json({}, 200, { "set-cookie": "q9_email=email-transaction-1; Path=/; HttpOnly" }),
  );
  worker.auto("email/verify", () => json(phoneSession("b")));
};

void test("an old OAuth attempt cannot switch accounts after an email sign-in", async () => {
  const { worker, keychain, restart, client, authWindow } = harness({});
  startsEmailWithCookie(worker);
  void client.startOAuth("google").catch(() => {});
  const state = (await authWindow(0)).url.searchParams.get("state") ?? "";
  assert.notEqual(keychain.value("oauthAttempt"), null);

  const restarted = restart();
  await restarted.verifyEmail("b@example.net", "123456");
  assert.equal(keychain.value("oauthAttempt"), null);

  await assert.rejects(restarted.finishOAuth({ code: "old", state }), SignInIncompleteError);
  assert.equal(
    worker.log.filter((entry) => entry.path === "oauth/exchange" && entry.body.code).length,
    0,
  );
  assert.equal(accessTokenOf(restarted), "access-b");
  assert.equal(keychain.value("refreshToken"), "refresh-b");
});

void test("an OAuth sign-in ends a saved email attempt, and so does signing out", async () => {
  const { worker, keychain, client, authWindow, returnLink } = harness({});
  startsEmailWithCookie(worker);
  await client.startEmail("b@example.net");
  assert.notEqual(keychain.value("emailAttempt"), null);

  const signingIn = client.startOAuth("google");
  const opened = await authWindow(0);
  opened.finish({ type: "success", url: returnLink(opened, "real") });
  await signingIn;
  assert.equal(keychain.value("emailAttempt"), null);

  await client.startEmail("b@example.net");
  worker.auto("sign-out", () => json({}));
  await client.signOut();
  assert.equal(keychain.value("emailAttempt"), null);
});

void test("a sent email code survives the app being killed: a new client resumes the screen and verifies it", async () => {
  const { worker, keychain, restart, client } = harness({});
  startsEmailWithCookie(worker);
  await client.startEmail("b@example.net");
  const saved = Schema.decodeUnknownSync(SavedEmail)(
    JSON.parse(keychain.value("emailAttempt") ?? "null"),
  );
  assert.equal(saved.email, "b@example.net");
  assert.ok(
    saved.expiresAt > Date.now() + 9 * 60_000 && saved.expiresAt <= Date.now() + 10 * 60_000,
  );

  const restarted = restart();
  assert.equal(await restarted.resumeEmail(), "b@example.net");
  await restarted.verifyEmail("b@example.net", "123456");
  assert.equal(accessTokenOf(restarted), "access-b");
  assert.equal(
    worker.log.findLast((entry) => entry.path === "email/verify")?.cookie,
    "q9_email=email-transaction-1",
  );
  assert.equal(keychain.value("emailAttempt"), null);
  assert.equal(await restart().resumeEmail(), null);
});

void test("a saved email code expires after ten minutes, and a different email discards it", async () => {
  const { worker, keychain, restart, clock, client } = harness({});
  startsEmailWithCookie(worker);
  await client.startEmail("b@example.net");

  assert.equal(await restart().resumeEmail(), "b@example.net");
  clock.skewMs = 10 * 60_000 + 1_000;
  assert.equal(await restart().resumeEmail(), null);
  assert.equal(keychain.value("emailAttempt"), null);

  clock.skewMs = 0;
  await client.startEmail("b@example.net");
  assert.equal(await restart().resumeEmail(), "b@example.net");
  await client.discardEmail();
  assert.equal(keychain.value("emailAttempt"), null);
  assert.equal(await restart().resumeEmail(), null);
});

void test("an expired saved attempt is deleted at launch and when the app returns to the foreground", async () => {
  const gone = { state: "s", verifier: "v", expiresAt: 1, cookies: [] };
  const { worker, keychain, client, clock } = harness({
    oauthAttempt: JSON.stringify(gone),
    emailAttempt: JSON.stringify({ email: "x@example.net", expiresAt: 1, cookies: [] }),
  });
  await client.bootstrap();
  assert.equal(keychain.value("oauthAttempt"), null);
  assert.equal(keychain.value("emailAttempt"), null);

  startsEmailWithCookie(worker);
  await client.startEmail("b@example.net");
  clock.skewMs = 10 * 60_000 + 1_000;
  await client.retry();
  assert.equal(keychain.value("emailAttempt"), null);
});

void test("an auth window that fails to open drops its own attempt and its cookie", async () => {
  const { worker, keychain, client, breakAuthWindow } = harness({});
  breakAuthWindow();
  await assert.rejects(client.startOAuth("google"), SignInIncompleteError);
  assert.equal(keychain.value("oauthAttempt"), null);

  // The dropped attempt's cookie does not travel with the next request.
  worker.auto("email/verify", () => json(phoneSession("b")));
  await client.verifyEmail("b@example.net", "123456");
  assert.equal(worker.log.findLast((entry) => entry.path === "email/verify")?.cookie, null);
});

void test("the saved OAuth attempt holds only the OAuth cookie, not an email code's", async () => {
  const { worker, keychain, client, authWindow } = harness({});
  startsEmailWithCookie(worker);
  await client.startEmail("b@example.net");
  void client.startOAuth("google").catch(() => {});
  await authWindow(0);
  const saved = Schema.decodeUnknownSync(
    Schema.Struct({ cookies: Schema.Array(Schema.Tuple(Schema.String, Schema.String)) }),
  )(JSON.parse(keychain.value("oauthAttempt") ?? "null"));
  assert.deepEqual(
    saved.cookies.map(([name]) => name),
    ["q9_phone"],
  );
});

void test("signing out clears the in-memory transaction cookies, not only the saved attempts", async () => {
  const { worker, client } = harness({});
  startsEmailWithCookie(worker);
  worker.auto("sign-out", () => json({}));
  await client.startEmail("b@example.net");
  await client.signOut();

  await client.verifyEmail("b@example.net", "123456");
  assert.equal(worker.log.findLast((entry) => entry.path === "email/verify")?.cookie, null);
});

void test("the epoch moves when a session ends or another account takes over, and not on refresh or offline", async () => {
  const { worker, keychain, client } = harness({ refreshToken: "refresh-a" });
  worker.auto("token", () => json(phoneSession("a")));
  worker.auto("sign-out", () => json({}));
  worker.auto("email/verify", () => json(phoneSession("b")));
  await client.bootstrap();
  const first = client.epoch();

  await client.fetchAccessToken({ forceRefreshToken: true });
  keychain.failReads(true);
  await client.fetchAccessToken({ forceRefreshToken: true });
  assert.equal(statusOf(client), "offline");
  keychain.failReads(false);
  await client.retry();
  assert.equal(client.epoch(), first);

  await client.signOut();
  assert.equal(client.epoch(), first + 1);
  await client.verifyEmail("b@example.net", "123456");
  assert.equal(client.epoch(), first + 1);
  await client.verifyEmail("b@example.net", "123456");
  assert.equal(client.epoch(), first + 1);
});

void test("a provider refusal returned to the app ends the attempt with the sign-in error and exchanges nothing", async () => {
  const { worker, keychain, client, authWindow } = harness({});
  const signingIn = client.startOAuth("google");
  const opened = await authWindow(0);
  const state = opened.url.searchParams.get("state") ?? "";
  opened.finish({
    type: "success",
    url: `q9chat://auth/callback?error=access_denied&state=${state}`,
  });
  await assert.rejects(signingIn, SignInIncompleteError);
  assert.equal(exchanges(worker).length, 0);
  assert.equal(keychain.value("oauthAttempt"), null);
  assert.equal(statusOf(client), "loading");

  // The next attempt starts at once: the refused window is not left holding the slot.
  const again = client.startOAuth("google");
  await authWindow(1);
  void again.catch(() => {});
});

void test("an account that signs out and back in is a new session, so what a screen held for the old one no longer applies", async () => {
  const { worker, client } = harness({ refreshToken: "refresh-a" });
  worker.auto("token", () => json(phoneSession("a")));
  worker.auto("sign-out", () => json({}));
  worker.auto("email/verify", () => json(phoneSession("a")));
  await client.bootstrap();
  const before = client.epoch();
  await client.signOut();
  await client.verifyEmail("a@example.net", "123456");
  assert.equal(accessTokenOf(client), "access-a");
  assert.notEqual(client.epoch(), before);
});

/** Waits until the Worker has been asked to revoke `count` times. */
async function revokesAsked(worker: ReturnType<typeof createWorker>, count: number) {
  for (let attempt = 0; attempt < 200 && worker.count("sign-out") < count; attempt += 1)
    await tick();
}

void test("signing out deletes the active key: a new client starts signed out and sends no refresh request", async () => {
  const { worker, keychain, restart, client } = harness(
    { refreshToken: "refresh-a" },
    { requestTimeoutMs: 30 },
  );
  worker.auto("token", () => json(phoneSession("a")));
  await client.bootstrap();

  // The revoke never answers, and the app is killed: the restart must still be signed out.
  await client.signOut();
  assert.equal(statusOf(client), "unauthenticated");
  assert.equal(keychain.value("refreshToken"), null);

  const restarted = restart();
  await restarted.bootstrap();
  assert.equal(statusOf(restarted), "unauthenticated");
  assert.equal(worker.count("token"), 1);
});

void test("when the active key cannot be deleted, sign-out fails and the person stays signed in", async () => {
  const { worker, keychain, client } = harness({ refreshToken: "refresh-a" });
  worker.auto("token", () => json(phoneSession("a")));
  worker.auto("sign-out", () => json({}));
  await client.bootstrap();

  keychain.failWrites(["refreshToken"]);
  await assert.rejects(client.signOut());
  assert.equal(statusOf(client), "authenticated");
  assert.equal(keychain.value("refreshToken"), "refresh-a");
  assert.equal(worker.count("sign-out"), 0);

  // Nothing is owed: when the keychain works again, signing out simply works.
  keychain.failWrites([]);
  await client.signOut();
  assert.equal(statusOf(client), "unauthenticated");
  assert.equal(keychain.value("refreshToken"), null);
});

void test("when the active key cannot be read, it is still deleted and the person is signed out", async () => {
  const { worker, keychain, restart, client } = harness({ refreshToken: "refresh-a" });
  worker.auto("token", () => json(phoneSession("a")));
  await client.bootstrap();

  keychain.failReads(true);
  await client.signOut();
  assert.equal(statusOf(client), "unauthenticated");
  assert.equal(keychain.value("refreshToken"), null);
  assert.equal(worker.count("sign-out"), 0);

  keychain.failReads(false);
  const restarted = restart();
  await restarted.bootstrap();
  assert.equal(statusOf(restarted), "unauthenticated");
  assert.equal(worker.count("token"), 1);
});

void test("revoke failures never sign the person back in", async () => {
  const { worker, keychain, restart, client } = harness({ refreshToken: "refresh-a" });
  worker.auto("token", () => json(phoneSession("a")));
  worker.auto("sign-out", () => json({}, 503));
  await client.bootstrap();

  await client.signOut();
  await revokesAsked(worker, 3);
  await tick();
  assert.equal(worker.count("sign-out"), 3);
  assert.equal(statusOf(client), "unauthenticated");
  assert.equal(keychain.value("refreshToken"), null);

  await client.retry();
  const restarted = restart();
  await restarted.bootstrap();
  assert.equal(statusOf(restarted), "unauthenticated");
  assert.equal(worker.count("token"), 1);
});

void test("a revoke never blocks a new sign-in, and the new sign-in's attempt survives the old sign-out", async () => {
  const { worker, keychain, client } = harness({ refreshToken: "refresh-a" });
  worker.auto("token", () => json(phoneSession("a")));
  startsEmailWithCookie(worker);
  await client.bootstrap();

  await client.signOut();
  const revoke = await worker.next("sign-out");
  assert.equal(revoke.body.refreshToken, "refresh-a");

  // The revoke is still out when a new sign-in starts and saves its attempt.
  await client.startEmail("b@example.net");
  assert.notEqual(keychain.value("emailAttempt"), null);
  worker.auto("sign-out", () => json({}, 503));
  revoke.reply(json({}, 503));
  await revokesAsked(worker, 3);
  await tick();
  assert.notEqual(keychain.value("emailAttempt"), null);

  await client.verifyEmail("b@example.net", "123456");
  assert.equal(accessTokenOf(client), "access-b");
  assert.equal(keychain.value("refreshToken"), "refresh-b");
  assert.equal(
    worker.log.findLast((entry) => entry.path === "email/verify")?.cookie,
    "q9_email=email-transaction-1",
  );
});

void test("from the offline restore screen, signing out works without the network", async () => {
  const { worker, keychain, restart, client } = harness({ refreshToken: "refresh-a" });
  worker.auto("token", () => json({}, 503));
  worker.auto("sign-out", () => json({}, 503));
  await client.bootstrap();
  assert.equal(statusOf(client), "offline");

  await client.signOut();
  assert.equal(statusOf(client), "unauthenticated");
  assert.equal(keychain.value("refreshToken"), null);

  const restarted = restart();
  await restarted.bootstrap();
  assert.equal(statusOf(restarted), "unauthenticated");
  assert.equal(worker.count("token"), 1);
});
