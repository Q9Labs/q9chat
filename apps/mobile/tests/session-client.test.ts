import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { test } from "node:test";

import { Schema } from "effect";

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
type Pending = { path: string; body: Body; reply: (response: Response | Error) => void };

const json = (body: object, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const phoneSession = (tag: string) => ({
  accessToken: `access-${tag}`,
  expiresAt: Date.now() + 3_600_000,
  user: { id: `user-${tag}`, email: `${tag}@example.net`, firstName: null, lastName: null },
  method: "email",
  refreshToken: `refresh-${tag}`,
});

const tick = () => new Promise((resolve) => setImmediate(resolve));

/** A stand-in Worker: a request waits for the test to answer it, unless an automatic answer is set. */
function createWorker() {
  const log: { path: string; body: Body }[] = [];
  const pending: Pending[] = [];
  const auto = new Map<string, (body: Body) => Response | Error>();
  globalThis.fetch = (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input);
    const path = url.pathname.replace("/api/auth/", "");
    const body = Schema.decodeUnknownSync(RequestBody)(
      JSON.parse(typeof init?.body === "string" ? init.body : "{}"),
    );
    log.push({ path, body });
    return new Promise<Response>((resolve, reject) => {
      const reply = (response: Response | Error) =>
        response instanceof Error ? reject(response) : resolve(response);
      const answer = auto.get(path);
      if (answer) reply(answer(body));
      else pending.push({ path, body, reply });
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

function createKeychain(initial: string | null) {
  let value = initial;
  let writeGate: Promise<void> | null = null;
  let readFails = false;
  return {
    get value() {
      return value;
    },
    set value(next: string | null) {
      value = next;
    },
    /** Holds every write until the returned function runs, like a slow native storage call. */
    holdWrites() {
      const gate = Promise.withResolvers<void>();
      writeGate = gate.promise;
      return gate.resolve;
    },
    failReads(fails: boolean) {
      readFails = fails;
    },
    read: async () => {
      if (readFails) throw new Error("keychain unavailable");
      return value;
    },
    write: async (token: string) => {
      await writeGate;
      value = token;
    },
    clear: async () => {
      value = null;
    },
  };
}

type AuthWindow = {
  url: URL;
  finish: (result: { type: "success"; url: string } | { type: "closed" }) => void;
};

function harness(initialToken: string | null) {
  const worker = createWorker();
  const keychain = createKeychain(initialToken);
  const windows: AuthWindow[] = [];
  const client = createSessionClient({
    store: keychain,
    openAuth: (url) =>
      new Promise((resolve) => {
        windows.push({ url: new URL(url), finish: resolve });
      }),
    randomBytes: (length) => randomBytes(length),
    sha256Base64: async (text) => createHash("sha256").update(text).digest("base64"),
    now: () => Date.now(),
  });
  worker.auto("oauth/exchange", (body) => (body.code ? json(phoneSession("oauth")) : json({})));
  return {
    worker,
    keychain,
    client,
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

const statusOf = (client: ReturnType<typeof harness>["client"]) => client.snapshot().status;
const accessTokenOf = (client: ReturnType<typeof harness>["client"]) => {
  const state = client.snapshot();
  return state.status === "authenticated" ? state.session.accessToken : null;
};

void test("a slow revoke for the old account does not delete the next account's token", async () => {
  const { worker, keychain, client } = harness("refresh-a");
  worker.auto("token", () => json(phoneSession("a")));
  await client.bootstrap();
  assert.equal(keychain.value, "refresh-a");

  const signingOut = client.signOut();
  const revoke = await worker.next("sign-out");
  assert.equal(revoke.body.refreshToken, "refresh-a");
  assert.equal(statusOf(client), "unauthenticated");

  worker.auto("email/verify", () => json(phoneSession("b")));
  await client.verifyEmail("b@example.net", "123456");
  assert.equal(keychain.value, "refresh-b");

  revoke.reply(json({}));
  await signingOut;
  assert.equal(keychain.value, "refresh-b");
  assert.equal(accessTokenOf(client), "access-b");
});

void test("a refresh whose storage write finishes after sign-out does not sign the person back in", async () => {
  const { worker, keychain, client } = harness("refresh-a");
  const releaseWrite = keychain.holdWrites();
  const restoring = client.bootstrap();
  (await worker.next("token")).reply(json(phoneSession("a2")));
  await tick();

  const signingOut = client.signOut();
  (await worker.next("sign-out")).reply(json({}));
  await signingOut;
  assert.equal(statusOf(client), "unauthenticated");

  releaseWrite();
  await restoring;
  assert.equal(statusOf(client), "unauthenticated");
  assert.equal(keychain.value, null);
});

void test("the refresh token is read from the keychain on every refresh, not kept in memory", async () => {
  const { worker, keychain, client } = harness("refresh-a");
  worker.auto("token", (body) =>
    json(phoneSession(body.refreshToken === "refresh-x" ? "x2" : "a2")),
  );
  await client.bootstrap();
  assert.equal(keychain.value, "refresh-a2");

  keychain.value = "refresh-x";
  await client.fetchAccessToken({ forceRefreshToken: true });
  const sent = worker.log
    .filter((entry) => entry.path === "token")
    .map((entry) => entry.body.refreshToken);
  assert.deepEqual(sent, ["refresh-a", "refresh-x"]);
});

void test("a cold start without a connection keeps the token, says it is offline, and recovers on retry", async () => {
  const { worker, keychain, client } = harness("refresh-a");
  const starting = client.bootstrap();
  (await worker.next("token")).reply(new TypeError("Network request failed"));
  await starting;
  assert.equal(statusOf(client), "offline");
  assert.equal(keychain.value, "refresh-a");

  const retrying = client.retry();
  assert.equal(statusOf(client), "loading");
  (await worker.next("token")).reply(json(phoneSession("a2")));
  await retrying;
  assert.equal(accessTokenOf(client), "access-a2");
  assert.equal(keychain.value, "refresh-a2");
});

void test("a server error keeps the token too; only a confirmed 401 signs the person out", async () => {
  const { worker, keychain, client } = harness("refresh-a");
  const starting = client.bootstrap();
  (await worker.next("token")).reply(json({}, 503));
  await starting;
  assert.equal(statusOf(client), "offline");
  assert.equal(keychain.value, "refresh-a");

  const retrying = client.retry();
  (await worker.next("token")).reply(json({ error: "session_expired" }, 401));
  await retrying;
  assert.equal(statusOf(client), "unauthenticated");
  assert.equal(keychain.value, null);
});

void test("a keychain read failure at launch is offline and retryable, not signed out", async () => {
  const { worker, keychain, client } = harness("refresh-a");
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
  const { worker, client } = harness("refresh-a");
  worker.auto("token", () => json(phoneSession("a")));
  await client.bootstrap();
  await client.retry();
  assert.equal(worker.count("token"), 1);
});

void test("a link with the wrong state is refused and leaves the live attempt alone", async () => {
  const { worker, client, authWindow, returnLink } = harness(null);
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
  assert.equal(worker.log.at(-1)?.body.code, "real");
});

void test("a link delivered again after sign-out is refused and exchanges nothing", async () => {
  const { worker, client, authWindow, returnLink } = harness(null);
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
  assert.equal(worker.log.filter((entry) => entry.body.code).length, 1);
});

void test("a second start is refused while an attempt is live, and the first still finishes", async () => {
  const { client, authWindow, returnLink } = harness(null);
  const first = client.startOAuth("google");
  const opened = await authWindow(0);
  await assert.rejects(client.startOAuth("apple"), SignInIncompleteError);

  opened.finish({ type: "success", url: returnLink(opened, "real") });
  await first;
  assert.equal(accessTokenOf(client), "access-oauth");
});

void test("an older auth window finishing after its replacement does not touch the new attempt", async () => {
  const { worker, client, authWindow, returnLink } = harness(null);
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
    worker.log.filter((entry) => entry.body.code).map((entry) => entry.body.code),
    ["new-code"],
  );
});

void test("the auth window and the deep-link route deliver the same link and share one exchange", async () => {
  const { worker, client, authWindow, returnLink } = harness(null);
  const signingIn = client.startOAuth("google");
  const opened = await authWindow(0);
  const state = opened.url.searchParams.get("state") ?? "";

  const route = client.finishOAuth({ code: "real", state });
  opened.finish({ type: "success", url: returnLink(opened, "real") });
  await Promise.all([route, signingIn]);
  assert.equal(accessTokenOf(client), "access-oauth");
  assert.equal(worker.log.filter((entry) => entry.body.code).length, 1);
});

void test("closing the auth window ends the attempt so the next one can start", async () => {
  const { client, authWindow, returnLink } = harness(null);
  const first = client.startOAuth("google");
  (await authWindow(0)).finish({ type: "closed" });
  await assert.rejects(first, SignInIncompleteError);

  const second = client.startOAuth("google");
  const opened = await authWindow(1);
  opened.finish({ type: "success", url: returnLink(opened, "real") });
  await second;
  assert.equal(accessTokenOf(client), "access-oauth");
});
