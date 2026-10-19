import { Either, Schema } from "effect";

import { Nonempty } from "./contracts.js";
import {
  beginTransaction,
  challenge,
  cookie,
  hasTransaction,
  randomToken,
  seal,
  setCookie,
  unseal,
} from "./cookies.server.js";
import { boundary, input, json, sessionResponse } from "./handlers.server.js";
import { authenticate, workosConfig } from "./workos.server.js";

const Transaction = Schema.Struct({
  state: Nonempty,
  verifier: Nonempty,
  returnTo: Nonempty,
  expiresAt: Schema.Number,
  method: Schema.Literal("google", "apple"),
});
const transactionCookie = "q9_oauth";
function redirect(location: string, cookies?: string) {
  const headers = new Headers({
    Location: location,
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
  });
  if (cookies) headers.set("Set-Cookie", cookies);
  return new Response(null, { status: 302, headers });
}
function returnPath(value: string | null, origin: string) {
  if (!value || /\\|%(?:2f|5c)/i.test(value)) return `${origin}/`;
  try {
    const url = new URL(value, origin);
    return url.origin === origin ? url.href : `${origin}/`;
  } catch {
    return `${origin}/`;
  }
}
export function oauthStart(request: Request, provider: string) {
  return boundary(request, async () => {
    const url = new URL(request.url);
    if ((provider !== "google" && provider !== "apple") || url.searchParams.get("client") !== "web")
      return json({ error: "invalid_input" }, 400);
    const state = randomToken();
    const verifier = randomToken();
    const authorize = new URL("https://api.workos.com/user_management/authorize");
    authorize.search = new URLSearchParams({
      client_id: workosConfig().WORKOS_CLIENT_ID,
      provider: provider === "google" ? "GoogleOAuth" : "AppleOAuth",
      response_type: "code",
      redirect_uri: `${url.origin}/api/auth/callback`,
      state,
      code_challenge: await challenge(verifier),
      code_challenge_method: "S256",
    }).toString();
    const transaction = await seal({
      state,
      verifier,
      returnTo: returnPath(url.searchParams.get("returnTo"), url.origin),
      expiresAt: Date.now() + 600_000,
      method: provider,
    });
    return redirect(authorize.href, setCookie(transactionCookie, transaction, 600));
  });
}
const Success = Schema.Struct({ code: Nonempty, state: Nonempty });
const Callback = Schema.Union(Success, Schema.Struct({ error: Nonempty, state: Nonempty }));
export async function oauthCallback(request: Request) {
  const response = await boundary(request, async () => {
    const url = new URL(request.url);
    const query = Schema.decodeUnknownEither(Callback)(Object.fromEntries(url.searchParams));
    const transaction = await unseal(cookie(request, transactionCookie), Transaction);
    if (
      Either.isLeft(query) ||
      !transaction ||
      transaction.expiresAt < Date.now() ||
      query.right.state !== transaction.state
    )
      return redirect(`${url.origin}/auth/error?reason=invalid_state`);
    if ("error" in query.right) return redirect(`${url.origin}/auth/error?reason=cancelled`);
    const auth = await authenticate({
      grant_type: "authorization_code",
      code: query.right.code,
      code_verifier: transaction.verifier,
      redirect_uri: `${url.origin}/api/auth/callback`,
    });
    const session = await sessionResponse(auth, "web");
    // cspell:ignore clickjacking
    // react-doctor-disable-next-line react-doctor/clickjacking-redirect-risk -- Safe because returnPath revalidates the destination against the request origin.
    const success = redirect(returnPath(transaction.returnTo, url.origin));
    for (const value of session.headers.getSetCookie()) success.headers.append("Set-Cookie", value);
    return success;
  });
  const terminal =
    response.status >= 400
      ? redirect(`${new URL(request.url).origin}/auth/error?reason=authentication_failed`)
      : response;
  terminal.headers.append("Set-Cookie", setCookie(transactionCookie, "", 0));
  return terminal;
}
export function oauthExchange(request: Request) {
  return boundary(request, async () => {
    const body = await input(
      request,
      Schema.Struct({
        code: Schema.optional(Nonempty),
        codeVerifier: Schema.String.pipe(Schema.pattern(/^[A-Za-z0-9._~-]{43,128}$/)),
      }),
    );
    if (!body.code)
      return json(
        { ok: true },
        200,
        new Headers({
          "Set-Cookie": await beginTransaction("q9_phone", await challenge(body.codeVerifier)),
        }),
      );
    if (!(await hasTransaction(request, "q9_phone", await challenge(body.codeVerifier))))
      return json({ error: "invalid_transaction" }, 401);
    const response = await sessionResponse(
      await authenticate({
        grant_type: "authorization_code",
        code: body.code,
        code_verifier: body.codeVerifier,
        redirect_uri: `${new URL(request.url).origin}/auth/phone-callback`,
      }),
      "phone",
    );
    response.headers.append("Set-Cookie", setCookie("q9_phone", "", 0));
    return response;
  });
}
/**
 * The page WorkOS returns the phone's auth session to. A code or a refusal (`error` with the state) goes
 * back to the app through its link, so the system window closes at once; anything else shows the web page.
 */
export function phoneCallback(request: Request) {
  const params = new URL(request.url).searchParams;
  const query = Schema.decodeUnknownEither(Callback)(Object.fromEntries(params));
  if (Either.isLeft(query))
    return redirect(`${new URL(request.url).origin}/auth/error?reason=phone_failed`);
  return redirect(`q9chat://auth/callback?${new URLSearchParams(query.right)}`);
}
