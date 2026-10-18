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
  const store: Store = {
    get: async (key) => {
      if (readFails) throw new Error("keychain unavailable");
      return values.get(key) ?? null;
    },
    set: async (key, value) => {
      await writeGate;
      values.set(key, value);
    },
    delete: async (key) => {
      await writeGate;
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
  const create = () =>
    createSessionClient({
      store: keychain.store,
      openAuth: (url) =>
        new Promise((resolve) => {
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
  assert.equal(statusOf(client), "unauthenticated");
  worker.auto("email/verify", () => json(phoneSession("b")));
  const signingInAsB = client.verifyEmail("b@example.net", "123456");

  releaseWrite();
  const revoke = await worker.next("sign-out");
  assert.equal(revoke.body.refreshToken, "refresh-a2");
  revoke.reply(json({}));
  await Promise.all([restoring, signingOut, signingInAsB]);

  assert.equal(keychain.value("refreshToken"), "refresh-b");
  assert.equal(keychain.value("pendingRevoke"), null);
  assert.equal(accessTokenOf(client), "access-b");
  assert.equal(client.revokeStatus(), "idle");
});

void test("a failed revoke keeps the token it needs, and a later retry revokes it", async () => {
  const { worker, keychain, client } = harness({ refreshToken: "refresh-a" });
  worker.auto("token", () => json(phoneSession("a")));
  await client.bootstrap();

  const signingOut = client.signOut();
  (await worker.next("sign-out")).reply(json({}, 503));
  await assert.rejects(signingOut);
  assert.equal(statusOf(client), "unauthenticated");
  assert.equal(client.revokeStatus(), "failed");
  assert.equal(keychain.value("refreshToken"), null);
  assert.equal(keychain.value("pendingRevoke"), JSON.stringify(["refresh-a"]));

  const retrying = client.retry();
  const revoke = await worker.next("sign-out");
  assert.equal(revoke.body.refreshToken, "refresh-a");
  revoke.reply(json({}));
  await retrying;
  assert.equal(client.revokeStatus(), "idle");
  assert.equal(keychain.value("pendingRevoke"), null);
});

void test("a failed revoke, then a new sign-in, then a later retry: the old token is revoked and the new session is intact", async () => {
  const { worker, keychain, client } = harness({ refreshToken: "refresh-a" });
  worker.auto("token", () => json(phoneSession("a")));
  await client.bootstrap();
  const signingOut = client.signOut();
  (await worker.next("sign-out")).reply(new TypeError("Network request failed"));
  await assert.rejects(signingOut);

  worker.auto("email/verify", () => json(phoneSession("b")));
  await client.verifyEmail("b@example.net", "123456");
  assert.equal(accessTokenOf(client), "access-b");
  assert.equal(keychain.value("refreshToken"), "refresh-b");
  assert.equal(keychain.value("pendingRevoke"), JSON.stringify(["refresh-a"]));
  assert.equal(client.revokeStatus(), "failed");

  const retrying = client.retry();
  const revoke = await worker.next("sign-out");
  assert.equal(revoke.body.refreshToken, "refresh-a");
  revoke.reply(json({}));
  await retrying;
  assert.equal(client.revokeStatus(), "idle");
  assert.equal(keychain.value("pendingRevoke"), null);
  assert.equal(keychain.value("refreshToken"), "refresh-b");
  assert.equal(accessTokenOf(client), "access-b");
});

void test("a restarted app retries the sign-out the server never confirmed", async () => {
  const { worker, keychain, restart } = harness({ pendingRevoke: JSON.stringify(["refresh-old"]) });
  worker.auto("token", () => json(phoneSession("a")));
  const starting = restart().bootstrap();
  const revoke = await worker.next("sign-out");
  assert.equal(revoke.body.refreshToken, "refresh-old");
  revoke.reply(json({}, 503));
  await starting;
  assert.equal(keychain.value("pendingRevoke"), JSON.stringify(["refresh-old"]));

  const again = restart();
  const second = again.bootstrap();
  (await worker.next("sign-out")).reply(json({}));
  await second;
  assert.equal(keychain.value("pendingRevoke"), null);
  assert.equal(again.revokeStatus(), "idle");
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

void test("a stalled revoke times out, keeps the token, and a retry then works", async () => {
  const { worker, keychain, client } = harness(
    { refreshToken: "refresh-a" },
    { requestTimeoutMs: 30 },
  );
  worker.auto("token", () => json(phoneSession("a")));
  await client.bootstrap();

  const signingOut = client.signOut();
  const stalled = await worker.next("sign-out");
  await assert.rejects(signingOut);
  assert.equal(stalled.signal?.aborted, true);
  assert.equal(client.revokeStatus(), "failed");
  assert.equal(keychain.value("pendingRevoke"), JSON.stringify(["refresh-a"]));

  const retrying = client.retry();
  (await worker.next("sign-out")).reply(json({}));
  await retrying;
  assert.equal(client.revokeStatus(), "idle");
  assert.equal(keychain.value("pendingRevoke"), null);
});

void test("a stalled revoke does not lock sign-in for longer than the deadline", async () => {
  const { worker, keychain, client } = harness(
    { refreshToken: "refresh-a" },
    { requestTimeoutMs: 30 },
  );
  worker.auto("token", () => json(phoneSession("a")));
  await client.bootstrap();
  const signingOut = client.signOut();
  signingOut.catch(() => {});
  await worker.next("sign-out");

  worker.auto("email/verify", () => json(phoneSession("b")));
  await client.verifyEmail("b@example.net", "123456");
  assert.equal(accessTokenOf(client), "access-b");
  assert.equal(keychain.value("refreshToken"), "refresh-b");
  assert.equal(keychain.value("pendingRevoke"), JSON.stringify(["refresh-a"]));
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

void test("retry does nothing unless the session is offline or a sign-out failed", async () => {
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

void test("a saved OAuth attempt expires after ten minutes", async () => {
  const { worker, restart, clock, client, authWindow } = harness({});
  void client.startOAuth("google").catch(() => {});
  const state = (await authWindow(0)).url.searchParams.get("state") ?? "";

  clock.skewMs = 10 * 60_000 + 1_000;
  const restarted = restart();
  await assert.rejects(restarted.finishOAuth({ code: "real", state }), SignInIncompleteError);
  assert.equal(exchanges(worker).length, 0);
  assert.equal(statusOf(restarted), "loading");
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
