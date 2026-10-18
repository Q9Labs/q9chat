import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { after, test } from "node:test";
import { setTimeout } from "node:timers/promises";

const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.endsWith(".js") && context.parentURL?.startsWith("file:")) {
      const target = new URL(specifier.slice(0, -3) + ".ts", context.parentURL);
      if (existsSync(target)) return nextResolve(target.href);
    }
    return nextResolve(specifier);
  },
});
after(() => hooks.deregister());
const { createSessionClient } = await import("../src/lib/session-client.ts");
function session(id = "user_one", expiresAt = Date.now() + 300_000) {
  return {
    accessToken: `access-${id}`,
    expiresAt,
    method: "email",
    user: { id, email: "test@example.net", firstName: null, lastName: null },
  };
}
async function until(condition: () => boolean) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (condition()) return;
    await setTimeout(5);
  }
  assert.fail("session event did not settle");
}

void test("sign-out waits for delayed verify cookie write and stale verification never restores memory", async () => {
  const original = globalThis.fetch;
  let cookie: string | null = null;
  let verifyStarted = false;
  const release = Promise.withResolvers<void>();
  const calls: string[] = [];
  globalThis.fetch = async (url) => {
    calls.push(typeof url === "string" ? url : url instanceof URL ? url.href : url.url);
    if (
      (typeof url === "string" ? url : url instanceof URL ? url.href : url.url).endsWith(
        "email/verify",
      )
    ) {
      verifyStarted = true;
      await release.promise;
      cookie = "refresh-cookie";
      return Response.json(session());
    }
    assert.equal(cookie, "refresh-cookie", "logout must run after the pending Set-Cookie");
    cookie = null;
    return Response.json({ ok: true });
  };
  try {
    const client = createSessionClient();
    const verifying = client.verifyEmail("test@example.net", "123456");
    await until(() => verifyStarted);
    const signingOut = client.signOut();
    await setTimeout(5);
    assert.equal(calls.length, 1);
    release.resolve();
    await Promise.all([verifying, signingOut]);
    assert.equal(client.getSnapshot().session, null);
    assert.equal(cookie, null);
    assert.deepEqual(calls, ["/api/auth/email/verify", "/api/auth/sign-out"]);
  } finally {
    release.resolve();
    globalThis.fetch = original;
  }
});

void test("refresh caches outside expiry buffer, single-flights inside it, and serializes across tabs", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  let active = 0;
  let maximum = 0;
  const release = Promise.withResolvers<void>();
  globalThis.fetch = async () => {
    calls++;
    active++;
    maximum = Math.max(maximum, active);
    await release.promise;
    active--;
    return Response.json(session());
  };
  try {
    const first = createSessionClient();
    const second = createSessionClient();
    const a = first.fetchAccessToken({ forceRefreshToken: true });
    const b = first.fetchAccessToken({ forceRefreshToken: true });
    assert.equal(a, b);
    const c = second.fetchAccessToken({ forceRefreshToken: true });
    await until(() => calls === 1);
    release.resolve();
    await Promise.all([a, b, c]);
    assert.equal(calls, 2);
    assert.equal(maximum, 1);
    await first.fetchAccessToken({ forceRefreshToken: false });
    assert.equal(calls, 2);
    globalThis.fetch = async () => {
      calls++;
      return Response.json(session("user_one", Date.now() + 29_000));
    };
    await first.fetchAccessToken({ forceRefreshToken: true });
    await first.fetchAccessToken({ forceRefreshToken: false });
    assert.equal(calls, 4);
  } finally {
    release.resolve();
    globalThis.fetch = original;
  }
});

void test("BroadcastChannel clears another tab on logout and refreshes it on account change without storing tokens", async () => {
  const original = globalThis.fetch;
  let identity: string | null = "user_one";
  globalThis.fetch = async (url) => {
    if (
      (typeof url === "string" ? url : url instanceof URL ? url.href : url.url).endsWith("sign-out")
    ) {
      identity = null;
      return Response.json({ ok: true });
    }
    if (
      (typeof url === "string" ? url : url instanceof URL ? url.href : url.url).endsWith(
        "email/verify",
      )
    )
      identity = "user_two";
    return identity ? Response.json(session(identity)) : Response.json({}, { status: 401 });
  };
  const first = createSessionClient();
  const second = createSessionClient();
  const closeFirst = first.start();
  const closeSecond = second.start();
  try {
    await until(() => second.getSnapshot().session?.user.id === "user_one");
    await first.signOut();
    await until(() => second.getSnapshot().session === null);
    assert.equal(await second.fetchAccessToken({ forceRefreshToken: false }), null);
    await first.verifyEmail("test@example.net", "123456");
    await until(() => second.getSnapshot().session?.user.id === "user_two");
    assert.equal(await second.fetchAccessToken({ forceRefreshToken: false }), "access-user_two");
  } finally {
    closeFirst();
    closeSecond();
    globalThis.fetch = original;
  }
});

void test("effect cleanup and restart still bootstrap the live session generation", async () => {
  const original = globalThis.fetch;
  const release = Promise.withResolvers<void>();
  let started = false;
  globalThis.fetch = async () => {
    started = true;
    await release.promise;
    return Response.json(session());
  };
  const client = createSessionClient();
  const first = client.start();
  await until(() => started);
  first();
  const last = client.start();
  try {
    release.resolve();
    await until(() => client.getSnapshot().session?.user.id === "user_one");
  } finally {
    release.resolve();
    last();
    globalThis.fetch = original;
  }
});

void test("a delayed refresh cannot restore another tab after logout invalidation", async () => {
  const original = globalThis.fetch;
  const release = Promise.withResolvers<void>();
  let delay = false;
  let started = false;
  let signedOut = false;
  globalThis.fetch = async (url) => {
    const path = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
    if (path.endsWith("sign-out")) {
      signedOut = true;
      return Response.json({ ok: true });
    }
    if (signedOut) return Response.json({}, { status: 401 });
    if (delay) {
      started = true;
      await release.promise;
    }
    return Response.json(session());
  };
  const first = createSessionClient();
  const second = createSessionClient();
  const closeFirst = first.start();
  const closeSecond = second.start();
  try {
    await until(
      () => first.getSnapshot().session !== null && second.getSnapshot().session !== null,
    );
    delay = true;
    const refreshing = second.fetchAccessToken({ forceRefreshToken: true });
    await until(() => started);
    const signingOut = first.signOut();
    await until(() => second.getSnapshot().session === null);
    release.resolve();
    assert.equal(await refreshing, null);
    await signingOut;
    assert.equal(second.getSnapshot().session, null);
  } finally {
    release.resolve();
    closeFirst();
    closeSecond();
    globalThis.fetch = original;
  }
});

void test("failed server revocation throws and restores the still-active session instead of reporting completed logout", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const path = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
    return path.endsWith("sign-out")
      ? Response.json({}, { status: 503 })
      : Response.json(session());
  };
  const first = createSessionClient();
  const second = createSessionClient();
  const closeFirst = first.start();
  const closeSecond = second.start();
  try {
    await until(() => second.getSnapshot().session !== null);
    await assert.rejects(first.signOut(), /auth_unavailable/);
    assert.equal(first.getSnapshot().session?.user.id, "user_one");
    await until(() => second.getSnapshot().session?.user.id === "user_one");
  } finally {
    closeFirst();
    closeSecond();
    globalThis.fetch = original;
  }
});

void test("concurrent account verifications reconcile every successful cookie write across tabs", async () => {
  const original = globalThis.fetch;
  const release = Promise.withResolvers<void>();
  let identity = "original";
  let secondStarted = false;
  let verifications = 0;
  let secondSettled = false;
  globalThis.fetch = async (url) => {
    const path = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
    if (path.endsWith("email/verify")) {
      verifications++;
      if (verifications === 2) {
        secondStarted = true;
        await release.promise;
        identity = "second";
      } else identity = "first";
    }
    return Response.json(session(identity));
  };
  const first = createSessionClient();
  const second = createSessionClient();
  const closeFirst = first.start();
  const closeSecond = second.start();
  try {
    await until(
      () => first.getSnapshot().session !== null && second.getSnapshot().session !== null,
    );
    const verifyingFirst = first.verifyEmail("first@example.net", "123456");
    const verifyingSecond = second.verifyEmail("second@example.net", "123456").finally(() => {
      secondSettled = true;
    });
    await verifyingFirst;
    await until(() => secondStarted || secondSettled);
    await until(() => second.getSnapshot().session === null || secondSettled);
    release.resolve();
    await verifyingSecond;
    await until(() => second.getSnapshot().session?.user.id === identity);
    await until(() => first.getSnapshot().session?.user.id === identity);
  } finally {
    release.resolve();
    closeFirst();
    closeSecond();
    globalThis.fetch = original;
  }
});
