import { Either, Schema } from "effect";

import { Client, Code, Email, Method, Nonempty, RefreshInput } from "./contracts.js";
import {
  beginTransaction,
  cookie,
  hasTransaction,
  seal,
  setCookie,
  transactionCookies,
  unseal,
} from "./cookies.server.js";
import { emailBudget } from "./rate-limit.server.js";
import { accessClaims, authenticate, WorkosError, workos } from "./workos.server.js";

const sessionCookie = "q9_session";
const StoredSession = Schema.Struct({
  refreshToken: Nonempty,
  method: Method,
  sessionId: Nonempty,
});
export function json(value: object, status = 200, headers = new Headers()) {
  headers.set("Cache-Control", "no-store");
  return Response.json(value, { status, headers });
}
class InputError extends Error {}
export async function input<A, I>(request: Request, schema: Schema.Schema<A, I>) {
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new InputError();
  const text = await request.text();
  if (text.length > 16_384) throw new InputError();
  const parsed = Schema.decodeUnknownEither(Schema.parseJson(schema))(text);
  if (Either.isLeft(parsed)) throw new InputError();
  return parsed.right;
}
function workosFailure(error: WorkosError) {
  if (error.code === "unsupported_method") return json({ error: "unsupported_method" }, 403);
  const unavailable = error.status >= 500 || error.status === 429;
  return json(
    { error: unavailable ? "auth_unavailable" : "authentication_failed" },
    unavailable ? 503 : 401,
  );
}
export async function boundary(request: Request, handler: () => Promise<Response>) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    return json({ error: "invalid_origin" }, 403);
  try {
    return await handler();
  } catch (error) {
    if (error instanceof InputError) return json({ error: "invalid_input" }, 400);
    if (error instanceof WorkosError) return workosFailure(error);
    // Never serialize upstream errors: they may contain credentials or tokens.
    return json({ error: "auth_unavailable" }, 503);
  }
}
function methodFromAuthentication(method: string | undefined) {
  switch (method) {
    case "MagicAuth":
      return "email";
    case "GoogleOAuth":
      return "google";
    case "AppleOAuth":
      return "apple";
    case undefined:
    default:
      throw new WorkosError({ status: 502, code: "unsupported_method" });
  }
}
export async function sessionResponse(
  auth: Awaited<ReturnType<typeof authenticate>>,
  client: "web" | "phone",
  method = methodFromAuthentication(auth.authentication_method),
) {
  const session = {
    accessToken: auth.access_token,
    expiresAt: accessClaims(auth.access_token).exp * 1000,
    user: {
      id: auth.user.id,
      email: auth.user.email,
      firstName: auth.user.first_name,
      lastName: auth.user.last_name,
    },
    method,
  };
  const refreshToken = await seal({
    refreshToken: auth.refresh_token,
    method,
    sessionId: accessClaims(auth.access_token).sid,
  });
  if (client === "phone") return json({ ...session, refreshToken });
  return json(
    session,
    200,
    new Headers({
      "Set-Cookie": setCookie(sessionCookie, refreshToken, 60 * 60 * 24 * 30),
    }),
  );
}
export function emailStart(request: Request) {
  return boundary(request, async () => {
    const { email } = await input(request, Schema.Struct({ email: Email }));
    const headers = new Headers({
      "Set-Cookie": await beginTransaction("q9_email", email.toLowerCase()),
    });
    if (!(await emailBudget(request, email, "start"))) return json({ ok: true }, 200, headers);
    try {
      await workos("magic_auth", { email }, Schema.Unknown);
    } catch (error) {
      // Identical responses for every valid address, including unknown accounts.
      if (!(error instanceof WorkosError)) throw error;
    }
    return json({ ok: true }, 200, headers);
  });
}
export function emailVerify(request: Request) {
  return boundary(request, async () => {
    const { email, code, client } = await input(
      request,
      Schema.Struct({ email: Email, code: Code, client: Client }),
    );
    if (!(await hasTransaction(request, "q9_email", email.toLowerCase())))
      return json({ error: "invalid_transaction" }, 401);
    if (!(await emailBudget(request, email, "verify")))
      return json({ error: "rate_limited" }, 429, new Headers({ "Retry-After": "60" }));
    try {
      const response = await sessionResponse(
        await authenticate({
          grant_type: "urn:workos:oauth:grant-type:magic-auth:code",
          email,
          code,
        }),
        client,
      );
      response.headers.append("Set-Cookie", setCookie("q9_email", "", 0));
      return response;
    } catch (error) {
      if (
        error instanceof WorkosError &&
        [
          "invalid_grant",
          "invalid_one_time_code",
          "entity_not_found",
          "invalid_code",
          "magic_auth_code_expired",
          "magic_auth_code_invalid",
        ].includes(error.code)
      )
        return json({ error: "invalid_code" }, 401);
      throw error;
    }
  });
}
async function refreshCredentials(request: Request) {
  const body = await input(request, RefreshInput);
  if (body.refreshToken) {
    const stored = await unseal(body.refreshToken, StoredSession);
    return stored ? { ...stored, client: "phone" as const } : null;
  }
  const stored = await unseal(cookie(request, sessionCookie), StoredSession);
  return stored ? { ...stored, client: "web" as const } : null;
}
export function token(request: Request) {
  return boundary(request, async () => {
    const credentials = await refreshCredentials(request);
    if (!credentials) return json({ error: "unauthenticated" }, 401);
    try {
      const auth = await authenticate({
        grant_type: "refresh_token",
        refresh_token: credentials.refreshToken,
      });
      const response = await sessionResponse(auth, credentials.client, credentials.method);
      if (auth.refresh_token === credentials.refreshToken) response.headers.delete("Set-Cookie");
      return response;
    } catch (error) {
      if (
        error instanceof WorkosError &&
        ["invalid_grant", "invalid_refresh_token", "session_revoked", "session_expired"].includes(
          error.code,
        )
      )
        // Only sign-out deletes the cookie: this response may follow a newer sign-in.
        return json({ error: "unauthenticated" }, 401);
      throw error;
    }
  });
}
export function signOut(request: Request) {
  return boundary(request, async () => {
    const credentials = await refreshCredentials(request);
    if (credentials) {
      try {
        await workos(
          "sessions/revoke",
          { session_id: credentials.sessionId },
          Schema.Unknown,
          "idempotent",
        );
      } catch (error) {
        if (!(error instanceof WorkosError) || error.status !== 404) throw error;
      }
    }
    const headers = new Headers();
    for (const name of [sessionCookie, ...transactionCookies])
      headers.append("Set-Cookie", setCookie(name, "", 0));
    return json({ ok: true }, 200, headers);
  });
}
