import { Either, Schema } from "effect";

import { config } from "./config.ts";
import { EmailVerificationError, PhoneSession, VerificationFailure } from "./contracts.ts";
import { applySetCookie, cookieHeader, type Jar } from "./cookies.ts";

/**
 * One POST to the Worker. The phone has no cookie jar of its own, so the sign-in transaction
 * cookies go in and out through `jar`, by hand.
 */
async function post(path: string, body: object, jar?: Jar) {
  const cookie = jar ? cookieHeader(jar) : undefined;
  const response = await fetch(`${config.authOrigin}/api/auth/${path}`, {
    method: "POST",
    credentials: "omit",
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(body),
  });
  if (jar) applySetCookie(jar, response.headers.get("set-cookie"));
  return response;
}

async function readSession(response: Response) {
  return Schema.decodeUnknownSync(PhoneSession)(await response.json());
}

async function readFailure(response: Response) {
  if (response.status !== 401) return;
  const failure = Schema.decodeUnknownEither(VerificationFailure)(await response.json());
  if (Either.isRight(failure)) throw new EmailVerificationError(failure.right.error);
}

/** Sends the code. The Worker answers ok for every well-formed address and sets the email transaction. */
export async function startEmail(email: string, jar: Jar) {
  const response = await post("email/start", { email }, jar);
  if (!response.ok) throw new Error("auth_unavailable");
}

export async function verifyEmail(email: string, code: string, jar: Jar) {
  const response = await post("email/verify", { email, code, client: "phone" }, jar);
  if (!response.ok) {
    await readFailure(response);
    throw new Error("auth_unavailable");
  }
  return readSession(response);
}

/** Creates the phone transaction the code exchange needs; it must come before the auth session opens. */
export async function startOAuthExchange(codeVerifier: string, jar: Jar) {
  const response = await post("oauth/exchange", { codeVerifier }, jar);
  if (!response.ok) throw new Error("auth_unavailable");
}

export async function exchangeOAuthCode(code: string, codeVerifier: string, jar: Jar) {
  const response = await post("oauth/exchange", { code, codeVerifier }, jar);
  if (!response.ok) throw new Error("auth_unavailable");
  return readSession(response);
}

/** The next session for a refresh token, or null when the Worker says the session is gone for good. */
export async function refreshSession(refreshToken: string) {
  const response = await post("token", { refreshToken });
  if (response.status === 401) return null;
  if (!response.ok) throw new Error("auth_unavailable");
  return readSession(response);
}

/** Revokes the session on the server; it throws when the server did not confirm. */
export async function revokeSession(refreshToken: string) {
  const response = await post("sign-out", { refreshToken });
  if (!response.ok) throw new Error("auth_unavailable");
}
