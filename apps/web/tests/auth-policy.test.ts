// cspell:ignore fevil cevil
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { after, test } from "node:test";

import { Schema } from "effect";

const envModule = `
const limiter = (max) => {
  const counts = new Map();
  return { async limit({key}) { const count = (counts.get(key) ?? 0) + 1; counts.set(key, count); return {success: count <= max}; } };
};
export const env = { WORKOS_API_KEY: "test-only", WORKOS_CLIENT_ID: "test-only",
 AUTH_START_IP: limiter(20), AUTH_START_EMAIL: limiter(3), AUTH_VERIFY_IP: limiter(60), AUTH_VERIFY_EMAIL: limiter(10) };
`;
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "cloudflare:workers")
      return { url: `data:text/javascript,${encodeURIComponent(envModule)}`, shortCircuit: true };
    if (specifier.endsWith(".js") && context.parentURL?.startsWith("file:")) {
      const target = new URL(specifier.slice(0, -3) + ".ts", context.parentURL);
      if (existsSync(target)) return nextResolve(target.href);
    }
    return nextResolve(specifier);
  },
});
after(() => hooks.deregister());
const routes = {
  start: (await import("../src/routes/api/auth/email/start.ts")).Route,
  verify: (await import("../src/routes/api/auth/email/verify.ts")).Route,
  oauth: (await import("../src/routes/api/auth/oauth/$provider.ts")).Route,
  callback: (await import("../src/routes/api/auth/callback.ts")).Route,
  exchange: (await import("../src/routes/api/auth/oauth/exchange.ts")).Route,
  token: (await import("../src/routes/api/auth/token.ts")).Route,
  signOut: (await import("../src/routes/api/auth/sign-out.ts")).Route,
  phone: (await import("../src/routes/auth/phone-callback.ts")).Route,
};
const { beginTransaction } = await import("../src/lib/auth/cookies.server.ts");
const origin = "https://chat.example.test";
let sequence = 0;
async function fixtureTransaction(route: keyof typeof routes, body?: object) {
  if (!body) return "";
  if (route === "verify" && "email" in body && typeof body.email === "string")
    return (await beginTransaction("q9_email", body.email.toLowerCase())).split(";")[0] ?? "";
  if (route === "exchange" && "codeVerifier" in body && typeof body.codeVerifier === "string") {
    const start = await call("exchange", { codeVerifier: body.codeVerifier }, "", "");
    return cookies(start);
  }
  return "";
}
async function call(
  route: keyof typeof routes,
  body?: object,
  query = "",
  cookie?: string,
  ip?: string,
  requestOrigin?: string,
) {
  cookie ??= await fixtureTransaction(route, body);
  const handlers = routes[route].options.server?.handlers;
  assert.ok(handlers && typeof handlers !== "function");
  const handler = body
    ? "POST" in handlers
      ? handlers.POST
      : undefined
    : "GET" in handlers
      ? handlers.GET
      : undefined;
  assert.ok(typeof handler === "function");
  const response: unknown = await Reflect.apply(handler, undefined, [
    {
      request: new Request(`${origin}/api/auth/${route}${query}`, {
        method: body ? "POST" : "GET",
        headers: {
          "content-type": "application/json",
          cookie,
          "CF-Connecting-IP": ip ?? `test-${++sequence}`,
          ...(requestOrigin ? { origin: requestOrigin } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      }),
      params: { provider: "google" },
    },
  ]);
  assert.ok(response instanceof Response);
  return response;
}
function auth(method: string | undefined = "MagicAuth") {
  return {
    access_token: `header.${btoa(JSON.stringify({ iat: 1, exp: 301, sid: "session_test" }))}.signature`,
    refresh_token: "test-refresh",
    authentication_method: method === "missing" ? undefined : method,
    user: { id: "user_test", email: "test@example.net", first_name: null, last_name: null },
  };
}
function cookies(response: Response) {
  return response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
}
async function transaction(returnTo = "/") {
  const response = await call(
    "oauth",
    undefined,
    `?client=web&returnTo=${encodeURIComponent(returnTo)}`,
  );
  assert.equal(response.status, 302);
  const state = new URL(response.headers.get("location") ?? "").searchParams.get("state");
  return { cookie: cookies(response), query: `?code=one-use&state=${state}` };
}
async function outside(work: () => Promise<void>, reply: typeof fetch) {
  const original = globalThis.fetch;
  globalThis.fetch = reply;
  try {
    await work();
  } finally {
    globalThis.fetch = original;
  }
}
const verifyBody = (email = `test-${++sequence}@example.net`) => ({
  email,
  code: "123456",
  client: "web",
});

void test("final callback redirects cannot leave the origin through normalization or encoded separators", async () => {
  await outside(
    async () => {
      for (const value of [
        "/.//evil.example",
        "//evil.example",
        "/\\evil.example",
        "/%2f%2fevil.example",
        "/%5cevil.example",
        "/a/..//evil.example",
        "/safe?x=1#ok",
      ]) {
        const tx = await transaction(value);
        const response = await call("callback", undefined, tx.query, tx.cookie);
        const destination = new URL(response.headers.get("location") ?? "", origin);
        assert.equal(destination.origin, origin, value);
        if (value === "/safe?x=1#ok") assert.equal(destination.href, `${origin}${value}`);
        assert.ok(response.headers.get("location")?.startsWith(origin));
        assert.match(response.headers.get("set-cookie") ?? "", /q9_oauth=;.*Max-Age=0/);
      }
    },
    async () => Response.json(auth("GoogleOAuth")),
  );
});

void test("one-time email and OAuth grants and refresh are never replayed on WorkOS 5xx", async () => {
  for (const route of ["verify", "exchange", "callback"] as const) {
    let count = 0;
    await outside(
      async () => {
        const tx = await transaction();
        const response =
          route === "callback"
            ? await call(route, undefined, tx.query, tx.cookie)
            : await call(
                route,
                route === "verify"
                  ? verifyBody()
                  : { code: "one-use", codeVerifier: "a".repeat(43) },
              );
        assert.equal(response.status, route === "callback" ? 302 : 503);
        assert.equal(count, 1);
        if (route === "callback")
          assert.match(response.headers.get("set-cookie") ?? "", /Max-Age=0/);
      },
      async () => {
        count++;
        return Response.json({}, { status: 502 });
      },
    );
  }
});

void test("callback cancellation, malformed state and upstream errors always consume the transaction and recover", async () => {
  await outside(
    async () => {
      const tx = await transaction();
      const state = new URLSearchParams(tx.query).get("state");
      for (const query of [
        `?error=access_denied&state=${state}`,
        "?code=x&state=wrong",
        "?error=upstream-secret",
        tx.query,
      ]) {
        const response = await call("callback", undefined, query, tx.cookie);
        assert.equal(response.status, 302);
        assert.match(
          response.headers.get("location") ?? "",
          /^https:\/\/chat.example.test\/auth\/error\?reason=/,
        );
        assert.doesNotMatch(response.headers.get("location") ?? "", /upstream-secret/);
        assert.match(response.headers.get("set-cookie") ?? "", /q9_oauth=;.*Max-Age=0/);
      }
      const phone = await call("phone", undefined, "?error=access_denied&state=x");
      assert.match(phone.headers.get("location") ?? "", /\/auth\/error\?reason=phone_failed/);
    },
    async () => Response.json({ error: "invalid_grant" }, { status: 400 }),
  );
});

void test("unsupported or missing methods on each original token path revoke without returning a session", async () => {
  for (const method of ["Password", "missing"]) {
    for (const route of ["verify", "exchange", "callback"] as const) {
      let revoked = 0;
      await outside(
        async () => {
          const tx = await transaction();
          const response =
            route === "callback"
              ? await call(route, undefined, tx.query, tx.cookie)
              : await call(
                  route,
                  route === "verify"
                    ? verifyBody()
                    : { code: "one-use", codeVerifier: "a".repeat(43) },
                );
          assert.equal(response.status, route === "callback" ? 302 : 403);
          assert.equal(revoked, 1);
          assert.doesNotMatch(response.headers.get("set-cookie") ?? "", /q9_session=/);
          assert.doesNotMatch(await response.text(), /test-refresh|header\./);
        },
        async (url, options) => {
          if (
            (typeof url === "string" ? url : url instanceof URL ? url.href : url.url).endsWith(
              "/authenticate",
            )
          )
            return Response.json(auth(method));
          assert.equal(options?.body, JSON.stringify({ session_id: "session_test" }));
          revoked++;
          return new Response(null, { status: 204 });
        },
      );
    }
  }
});

void test("refresh retains an allowed missing method, rejects forbidden methods, and fails closed when revoke fails", async () => {
  let responseAuth = auth();
  let revokeStatus = 204;
  let revokeCalls = 0;
  await outside(
    async () => {
      const signedIn = await call("verify", verifyBody());
      const cookie = cookies(signedIn);
      responseAuth = auth("missing");
      assert.equal((await call("token", {}, "", cookie)).status, 200);
      responseAuth = auth("Password");
      assert.equal((await call("token", {}, "", cookie)).status, 403);
      revokeStatus = 503;
      const failed = await call("token", {}, "", cookie);
      assert.equal(failed.status, 503);
      assert.equal(failed.headers.get("set-cookie"), null);
      assert.equal(revokeCalls, 4); // one successful revoke, then three idempotent attempts
    },
    async (url) => {
      if (
        (typeof url === "string" ? url : url instanceof URL ? url.href : url.url).endsWith(
          "/authenticate",
        )
      )
        return Response.json(responseAuth);
      revokeCalls++;
      return revokeStatus === 204
        ? new Response(null, { status: 204 })
        : Response.json({}, { status: revokeStatus });
    },
  );
});

void test("phone exchange forwards PKCE; mismatch fails; deep link strips extra query fields", async () => {
  await outside(
    async () => {
      assert.equal((await call("exchange", { code: "x", codeVerifier: "bad" })).status, 400);
      const response = await call("exchange", { code: "x", codeVerifier: "a".repeat(43) });
      assert.equal(response.status, 401);
      const phone = await call("phone", undefined, "?code=x&state=y&token=secret");
      assert.equal(phone.headers.get("location"), "q9chat://auth/callback?code=x&state=y");
    },
    async (_url, options) => {
      assert.equal(typeof options?.body, "string");
      assert.ok(typeof options?.body === "string");
      const body = Schema.decodeUnknownSync(
        Schema.parseJson(
          Schema.Struct({ code_verifier: Schema.String, redirect_uri: Schema.String }),
        ),
      )(options.body);
      assert.equal(body.code_verifier, "a".repeat(43));
      assert.equal(body.redirect_uri, `${origin}/auth/phone-callback`);
      return Response.json({ error: "invalid_grant" }, { status: 400 });
    },
  );
});

void test("expired email codes map to invalid_code", async () => {
  await outside(
    async () => {
      const response = await call("verify", verifyBody());
      assert.equal(response.status, 401);
      assert.deepEqual(await response.json(), { error: "invalid_code" });
    },
    async () => Response.json({ code: "magic_auth_code_expired" }, { status: 400 }),
  );
});

void test("per-email and per-IP budgets stop requests before WorkOS, without enumerating email/start", async () => {
  let calls = 0;
  await outside(
    async () => {
      for (let index = 0; index < 5; index++) {
        const response = await call("start", {
          email: index % 2 ? "Budget@Example.NET" : "budget@example.net",
        });
        assert.deepEqual(await response.json(), { ok: true });
      }
      assert.equal(calls, 3);
      calls = 0;
      for (let index = 0; index < 22; index++)
        await call("start", { email: `ip-${index}@example.net` }, "", "", "same-start-ip");
      assert.equal(calls, 20);
      calls = 0;
      for (let index = 0; index < 12; index++) {
        const response = await call("verify", verifyBody("verify-budget@example.net"));
        assert.equal(response.status, index < 10 ? 200 : 429);
      }
      assert.equal(calls, 10);
      calls = 0;
      for (let index = 0; index < 62; index++)
        await call("verify", verifyBody(), "", undefined, "same-verify-ip");
      assert.equal(calls, 60);
    },
    async () => {
      calls++;
      return Response.json(auth());
    },
  );
});

void test("concurrent callbacks rely on WorkOS single-use codes; both clear state, only one sets a session", async () => {
  let redeemed = false;
  await outside(
    async () => {
      const tx = await transaction();
      const responses = await Promise.all([
        call("callback", undefined, tx.query, tx.cookie),
        call("callback", undefined, tx.query, tx.cookie),
      ]);
      assert.equal(
        responses.filter((response) => response.headers.get("set-cookie")?.includes("q9_session="))
          .length,
        1,
      );
      for (const response of responses)
        assert.match(response.headers.get("set-cookie") ?? "", /q9_oauth=;.*Max-Age=0/);
    },
    async () => {
      if (redeemed) return Response.json({ error: "invalid_grant" }, { status: 400 });
      redeemed = true;
      return Response.json(auth("GoogleOAuth"));
    },
  );
});

void test("token and sign-out reject foreign origins without contacting WorkOS", async () => {
  await outside(
    async () => {
      for (const route of ["token", "signOut"] as const) {
        const response = await call(route, {}, "", "", undefined, "https://evil.example");
        assert.equal(response.status, 403);
      }
    },
    async () => {
      assert.fail("foreign origin must not reach WorkOS");
    },
  );
});

void test("refresh grants are not retried on 5xx either", async () => {
  let failing = false;
  let calls = 0;
  await outside(
    async () => {
      const signedIn = await call("verify", verifyBody());
      failing = true;
      const response = await call("token", {}, "", cookies(signedIn));
      assert.equal(response.status, 503);
      assert.equal(calls, 1);
    },
    async () => {
      if (!failing) return Response.json(auth());
      calls++;
      return Response.json({}, { status: 502 });
    },
  );
});

void test("sign-out clears every transaction; late email, phone and OAuth grants never reach WorkOS", async () => {
  let upstream = 0;
  await outside(
    async () => {
      const email = "transaction@example.net";
      const start = await call("start", { email });
      assert.match(cookies(start), /q9_email=.+/);
      const tx = await transaction();
      const phone = await call("exchange", { codeVerifier: "a".repeat(43) }, "", "");
      assert.match(cookies(phone), /q9_phone=.+/);
      const logout = await call(
        "signOut",
        {},
        "",
        `${cookies(start)}; ${tx.cookie}; ${cookies(phone)}`,
      );
      for (const name of ["q9_session", "q9_email", "q9_oauth", "q9_phone"])
        assert.ok(
          logout.headers
            .getSetCookie()
            .some((value) => value.startsWith(`${name}=;`) && value.includes("Max-Age=0")),
        );
      upstream = 0;
      const verify = await call("verify", verifyBody(email), "", "");
      assert.deepEqual(await verify.json(), { error: "invalid_transaction" });
      const exchange = await call(
        "exchange",
        { code: "late", codeVerifier: "a".repeat(43) },
        "",
        "",
      );
      assert.deepEqual(await exchange.json(), { error: "invalid_transaction" });
      const callback = await call("callback", undefined, tx.query, "");
      assert.equal(callback.headers.get("location"), `${origin}/auth/error?reason=invalid_state`);
      assert.equal(upstream, 0);
      const wrongEmail = await call("verify", verifyBody("other@example.net"), "", cookies(start));
      assert.equal(wrongEmail.status, 401);
      assert.equal(upstream, 0);
    },
    async () => {
      upstream++;
      return Response.json({ ok: true });
    },
  );
});
