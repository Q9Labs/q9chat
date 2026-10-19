import assert from "node:assert/strict";
import { test } from "node:test";

import { applySetCookie, cookieHeader, type Jar } from "../src/session/cookies.ts";
import { authorizeUrl, base64Url, callbackParams, toBase64Url } from "../src/session/pkce.ts";

void test("base64url has no padding and uses the URL-safe alphabet", () => {
  assert.equal(toBase64Url("ab+c/d=="), "ab-c_d");
  assert.equal(base64Url(Uint8Array.from([251, 255, 254])), "-__-");
  // 32 random bytes make a 43 character verifier, the shortest the Worker accepts.
  assert.match(base64Url(new Uint8Array(32).fill(7)), /^[A-Za-z0-9._~-]{43}$/);
});

void test("the authorize URL asks WorkOS for the provider and returns to the phone callback", () => {
  const url = authorizeUrl({
    clientId: "client_01ABC",
    provider: "google",
    redirectUri: "http://localhost:3000/auth/phone-callback",
    state: "s t",
    challenge: "challenge-_",
  });
  assert.equal(
    url,
    "https://api.workos.com/user_management/authorize?client_id=client_01ABC&provider=GoogleOAuth&response_type=code&redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fauth%2Fphone-callback&state=s%20t&code_challenge=challenge-_&code_challenge_method=S256",
  );
  assert.match(
    authorizeUrl({
      clientId: "c",
      provider: "apple",
      redirectUri: "r",
      state: "s",
      challenge: "x",
    }),
    /provider=AppleOAuth/,
  );
});

void test("a returning link yields its code and state, and a failed one yields nothing", () => {
  assert.deepEqual(callbackParams("q9chat://auth/callback?code=abc&state=xyz"), {
    code: "abc",
    state: "xyz",
  });
  assert.deepEqual(callbackParams("q9chat://auth/callback?state=x%20y&code=a%2Bb#frag"), {
    code: "a+b",
    state: "x y",
  });
  assert.equal(callbackParams("q9chat://auth/callback"), null);
  assert.equal(callbackParams("q9chat://auth/callback?code=abc"), null);
  assert.equal(callbackParams("q9chat://auth/callback?error=access_denied&state=xyz"), null);
  assert.equal(callbackParams("q9chat://auth/callback?code=abc&state=xyz&error=denied"), null);
});

void test("the jar keeps the sign-in cookies a response sets and drops the cleared ones", () => {
  const jar: Jar = new Map();
  applySetCookie(
    jar,
    "q9_email=abc.def; HttpOnly; Secure; SameSite=Lax; Path=/api/auth; Max-Age=600",
  );
  assert.equal(cookieHeader(jar), "q9_email=abc.def");
  // React Native joins several Set-Cookie headers with a comma.
  applySetCookie(
    jar,
    "q9_phone=ghi.jkl; HttpOnly; Secure; Path=/api/auth; Max-Age=600, q9_email=; HttpOnly; Secure; Path=/api/auth; Max-Age=0",
  );
  assert.equal(cookieHeader(jar), "q9_phone=ghi.jkl");
  applySetCookie(jar, null);
  applySetCookie(jar, "q9_session=ignored; Path=/api/auth");
  assert.equal(cookieHeader(jar), "q9_phone=ghi.jkl");
  applySetCookie(jar, "q9_phone=; Max-Age=0");
  assert.equal(cookieHeader(jar), undefined);
});
