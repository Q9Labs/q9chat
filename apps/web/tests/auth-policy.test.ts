import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";

const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "cloudflare:workers") {
      return {
        url: 'data:text/javascript,export const env = { WORKOS_API_KEY: "test-only", WORKOS_CLIENT_ID: "test-only" };',
        shortCircuit: true,
      };
    }
    if (specifier.endsWith(".js") && context.parentURL?.startsWith("file:")) {
      const target = new URL(specifier.slice(0, -3) + ".ts", context.parentURL);
      if (existsSync(target)) return nextResolve(target.href);
    }
    return nextResolve(specifier);
  },
});

void test("email public route rejects and revokes an unsupported WorkOS method", async () => {
  const { Route } = await import("../src/routes/api/auth/email/verify.ts");
  const handlers = Route.options.server?.handlers;
  assert.ok(handlers && typeof handlers !== "function");
  const handler = handlers.POST;
  assert.ok(typeof handler === "function");
  const originalFetch = globalThis.fetch;
  let revoked = false;
  const calls: string[] = [];
  const token = `header.${btoa(JSON.stringify({ iat: 1, exp: 301, sid: "session_test" }))}.signature`;
  // Only the outside WorkOS service is replaced. The public route, schemas,
  // Effect transport, allow-list, and revoke path are the production code.
  globalThis.fetch = async (url, options) => {
    const endpoint = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
    calls.push(endpoint);
    if (endpoint.endsWith("/authenticate")) {
      return Response.json({
        access_token: token,
        refresh_token: "test-refresh",
        authentication_method: "Password",
        user: { id: "user_test", email: "test@example.net", first_name: null, last_name: null },
      });
    }
    assert.equal(endpoint, "https://api.workos.com/user_management/sessions/revoke");
    assert.equal(options?.body, JSON.stringify({ session_id: "session_test" }));
    revoked = true;
    return new Response(null, { status: 204 });
  };
  try {
    const response: unknown = await Reflect.apply(handler, undefined, [
      {
        request: new Request("https://chat.example.test/api/auth/email/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: "test@example.net", code: "123456", client: "web" }),
        }),
      },
    ]);
    assert.ok(response instanceof Response);
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { error: "unsupported_method" });
    assert.equal(response.headers.get("set-cookie"), null);
    assert.ok(revoked);
    assert.equal(calls.length, 2);
  } finally {
    globalThis.fetch = originalFetch;
    hooks.deregister();
  }
});
