import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { Schema } from "effect";

import { Session } from "../src/lib/auth/contracts.ts";
import { verifyConvexToken } from "./convex-identity.ts";

const origin = process.env["AUTH_TEST_ORIGIN"] ?? "http://localhost:3000";
async function post(path: string, body: object, cookie?: string) {
  const headers = new Headers({ "content-type": "application/json", origin });
  if (cookie) headers.set("cookie", cookie);
  return fetch(`${origin}/api/auth/${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    redirect: "manual",
  });
}
function sessionCookie(response: Response) {
  const value = response.headers.getSetCookie().find((header) => header.startsWith("q9_session="));
  assert.ok(value);
  assert.match(value, /HttpOnly; Secure; SameSite=Lax; Path=\/api\/auth/);
  return value.split(";")[0];
}

void test("public routes reject invalid inputs and unsafe origins", async () => {
  assert.equal((await post("email/start", { email: "invalid" })).status, 400);
  assert.equal(
    (await post("email/verify", { email: "test@example.com", code: "abc", client: "web" })).status,
    400,
  );
  assert.equal((await post("token", {})).status, 401);
  const crossOrigin = await fetch(`${origin}/api/auth/token`, {
    method: "POST",
    headers: { origin: "https://evil.example", "content-type": "application/json" },
    body: "{}",
  });
  assert.equal(crossOrigin.status, 403);
  assert.equal(
    (await fetch(`${origin}/api/auth/callback?code=invalid&state=invalid`, { redirect: "manual" }))
      .status,
    400,
  );
});

void test("Google web redirect carries state, PKCE and the exact callback", async () => {
  const response = await fetch(
    `${origin}/api/auth/oauth/google?client=web&returnTo=//evil.example`,
    { redirect: "manual" },
  );
  assert.equal(response.status, 302);
  const location = new URL(response.headers.get("location") ?? "");
  assert.equal(location.origin, "https://api.workos.com");
  assert.equal(location.pathname, "/user_management/authorize");
  assert.equal(location.searchParams.get("provider"), "GoogleOAuth");
  assert.equal(location.searchParams.get("redirect_uri"), `${origin}/api/auth/callback`);
  assert.equal(location.searchParams.get("code_challenge_method"), "S256");
  assert.match(location.searchParams.get("code_challenge") ?? "", /^[\w-]{43}$/);
  assert.match(location.searchParams.get("state") ?? "", /^[\w-]{43}$/);
  assert.match(
    response.headers.get("set-cookie") ?? "",
    /q9_oauth=.*HttpOnly; Secure; SameSite=Lax/,
  );
  const phone = await fetch(`${origin}/auth/phone-callback?code=hello%26other&state=test`, {
    redirect: "manual",
  });
  assert.equal(
    phone.headers.get("location"),
    "q9chat://auth/callback?code=hello%26other&state=test",
  );
});

void test("real staging email sign-in, refresh persistence and sign-out", async () => {
  const vars = await readFile(
    join(dirname(fileURLToPath(import.meta.url)), "..", ".dev.vars"),
    "utf8",
  );
  const key = vars
    .split("\n")
    .find((line) => line.startsWith("WORKOS_API_KEY="))
    ?.slice("WORKOS_API_KEY=".length);
  assert.ok(key, "staging Worker credentials required");
  const email = `q9-auth-${Date.now()}@example.net`;
  assert.deepEqual(await (await post("email/start", { email })).json(), { ok: true });
  const challenge = await fetch("https://api.workos.com/user_management/magic_auth", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  assert.ok(challenge.ok, "Magic Auth must be enabled before running this test");
  const challengeBody: unknown = await challenge.json();
  const { code } = Schema.decodeUnknownSync(Schema.Struct({ code: Schema.String }))(challengeBody);
  const wrong = code === "000000" ? "111111" : "000000";
  assert.deepEqual(
    await (await post("email/verify", { email, code: wrong, client: "web" })).json(),
    { error: "invalid_code" },
  );
  const verified = await post("email/verify", { email, code, client: "web" });
  assert.equal(verified.status, 200);
  const first = Schema.decodeUnknownSync(Session)(await verified.json());
  const firstCookie = sessionCookie(verified);
  const refreshed = await post("token", {}, firstCookie);
  assert.equal(refreshed.status, 200);
  const second = Schema.decodeUnknownSync(Session)(await refreshed.json());
  const rotatedCookie = sessionCookie(refreshed);
  console.warn(`Observed WorkOS refresh token changed: ${firstCookie !== rotatedCookie}`);
  const payload = second.accessToken.split(".")[1];
  assert.ok(payload);
  const claims = Schema.decodeUnknownSync(
    Schema.Struct({ exp: Schema.Number, iat: Schema.Number, sub: Schema.String }),
  )(JSON.parse(atob(payload.replaceAll("-", "+").replaceAll("_", "/"))));
  assert.equal(second.expiresAt, claims.exp * 1000);
  assert.ok(first.accessToken);
  await verifyConvexToken(second.accessToken);
  console.warn(
    "Convex public query authentication accepted the staging JWT; no function was deployed.",
  );
  console.warn(`Observed WorkOS access lifetime: ${claims.exp - claims.iat}s`);
  const signedOut = await post("sign-out", {}, rotatedCookie);
  assert.equal(signedOut.status, 200);
  assert.match(signedOut.headers.get("set-cookie") ?? "", /q9_session=;.*Max-Age=0/);
  assert.equal((await post("token", {}, rotatedCookie)).status, 401, "session revoked at WorkOS");
});
