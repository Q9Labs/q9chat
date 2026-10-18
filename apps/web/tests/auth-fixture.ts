import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";

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
const { beginTransaction, seal } = await import("../src/lib/auth/cookies.server.ts");
hooks.deregister();
export const origin = "https://chat.example.test";
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
export async function call(
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
export function auth(method: string | undefined = "MagicAuth") {
  return {
    access_token: `header.${btoa(JSON.stringify({ iat: 1, exp: 301, sid: "session_test" }))}.signature`,
    refresh_token: "test-refresh",
    authentication_method: method === "missing" ? undefined : method,
    user: { id: "user_test", email: "test@example.net", first_name: null, last_name: null },
  };
}
export function cookies(response: Response) {
  return response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
}
export async function transaction(returnTo = "/") {
  const response = await call(
    "oauth",
    undefined,
    `?client=web&returnTo=${encodeURIComponent(returnTo)}`,
  );
  assert.equal(response.status, 302);
  const state = new URL(response.headers.get("location") ?? "").searchParams.get("state");
  return { cookie: cookies(response), query: `?code=one-use&state=${state}` };
}
export async function outside(work: () => Promise<void>, reply: typeof fetch) {
  const original = globalThis.fetch;
  globalThis.fetch = reply;
  try {
    await work();
  } finally {
    globalThis.fetch = original;
  }
}

export { seal };
