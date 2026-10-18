import { Either, Schema } from "effect";

import { config } from "./config.ts";
import { EmailVerificationError, PhoneSession, VerificationFailure } from "./contracts.ts";
import { applySetCookie, cookieHeader, type Jar } from "./cookies.ts";

/** How long one Worker request may take in total, response body included. */
export const REQUEST_TIMEOUT_MS = 15_000;

export type RequestOptions = {
  /** Cancels the request from outside, for example when the person signs out meanwhile. */
  signal?: AbortSignal;
  timeoutMs?: number;
};

type Reply = { ok: boolean; status: number; body: unknown };

/** Runs `work` with a signal that aborts at the deadline or when the caller's `signal` does. */
async function withDeadline<T>(
  { signal, timeoutMs = REQUEST_TIMEOUT_MS }: RequestOptions,
  work: (deadline: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("auth_timeout")), timeoutMs);
  const abort = () => controller.abort(signal?.reason);
  if (signal?.aborted) abort();
  signal?.addEventListener("abort", abort);
  try {
    return await work(controller.signal);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}

/**
 * One POST to the Worker. The phone has no cookie jar of its own, so the sign-in transaction
 * cookies go in and out through `jar`, by hand. The whole exchange, body included, ends at the
 * deadline or when `signal` aborts, so a stalled connection never leaves a caller waiting.
 */
function post(path: string, body: object, jar: Jar | undefined, options: RequestOptions) {
  return withDeadline(options, async (signal) => {
    const cookie = jar ? cookieHeader(jar) : undefined;
    const response = await fetch(`${config.authOrigin}/api/auth/${path}`, {
      method: "POST",
      credentials: "omit",
      headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
      body: JSON.stringify(body),
      signal,
    });
    if (jar) applySetCookie(jar, response.headers.get("set-cookie"));
    return readReply(response);
  });
}

/** Only a success or a 401 carries a body the callers read, so any other failure is not read. */
async function readReply(response: Response): Promise<Reply> {
  const { ok, status } = response;
  if (!ok && status !== 401) return { ok, status, body: null };
  return { ok, status, body: parseJson(await response.text()) };
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

const readSession = (reply: Reply) => Schema.decodeUnknownSync(PhoneSession)(reply.body);

function readFailure(reply: Reply) {
  if (reply.status !== 401) return;
  const failure = Schema.decodeUnknownEither(VerificationFailure)(reply.body);
  if (Either.isRight(failure)) throw new EmailVerificationError(failure.right.error);
}

/** Sends the code. The Worker answers ok for every well-formed address and sets the email transaction. */
export async function startEmail(email: string, jar: Jar, options: RequestOptions = {}) {
  const reply = await post("email/start", { email }, jar, options);
  if (!reply.ok) throw new Error("auth_unavailable");
}

export async function verifyEmail(
  email: string,
  code: string,
  jar: Jar,
  options: RequestOptions = {},
) {
  const reply = await post("email/verify", { email, code, client: "phone" }, jar, options);
  if (!reply.ok) {
    readFailure(reply);
    throw new Error("auth_unavailable");
  }
  return readSession(reply);
}

/** Creates the phone transaction the code exchange needs; it must come before the auth session opens. */
export async function startOAuthExchange(
  codeVerifier: string,
  jar: Jar,
  options: RequestOptions = {},
) {
  const reply = await post("oauth/exchange", { codeVerifier }, jar, options);
  if (!reply.ok) throw new Error("auth_unavailable");
}

export async function exchangeOAuthCode(
  code: string,
  codeVerifier: string,
  jar: Jar,
  options: RequestOptions = {},
) {
  const reply = await post("oauth/exchange", { code, codeVerifier }, jar, options);
  if (!reply.ok) throw new Error("auth_unavailable");
  return readSession(reply);
}

/** The next session for a refresh token, or null when the Worker says the session is gone for good. */
export async function refreshSession(refreshToken: string, options: RequestOptions = {}) {
  const reply = await post("token", { refreshToken }, undefined, options);
  if (reply.status === 401) return null;
  if (!reply.ok) throw new Error("auth_unavailable");
  return readSession(reply);
}

/** Revokes the session on the server; it throws when the server did not confirm. */
export async function revokeSession(refreshToken: string, options: RequestOptions = {}) {
  const reply = await post("sign-out", { refreshToken }, undefined, options);
  if (!reply.ok) throw new Error("auth_unavailable");
}
