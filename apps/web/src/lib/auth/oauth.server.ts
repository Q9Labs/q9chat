import { Either, Schema } from "effect";

import { Nonempty } from "./contracts.js";
import { challenge, cookie, randomToken, seal, setCookie, unseal } from "./cookies.server.js";
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
  if (!value?.startsWith("/") || value.startsWith("//")) return "/";
  const url = new URL(value, origin);
  return url.origin === origin ? `${url.pathname}${url.search}${url.hash}` : "/";
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
const Callback = Schema.Struct({ code: Nonempty, state: Nonempty });
export function oauthCallback(request: Request) {
  return boundary(request, async () => {
    const url = new URL(request.url);
    const query = Schema.decodeUnknownEither(Callback)(Object.fromEntries(url.searchParams));
    const transaction = await unseal(cookie(request, transactionCookie), Transaction);
    const clear = setCookie(transactionCookie, "", 0);
    if (
      Either.isLeft(query) ||
      !transaction ||
      transaction.expiresAt < Date.now() ||
      query.right.state !== transaction.state
    )
      return json({ error: "invalid_state" }, 400, new Headers({ "Set-Cookie": clear }));
    const auth = await authenticate({
      grant_type: "authorization_code",
      code: query.right.code,
      code_verifier: transaction.verifier,
      redirect_uri: `${url.origin}/api/auth/callback`,
    });
    const session = await sessionResponse(auth, "web");
    const response = redirect(transaction.returnTo, clear);
    for (const value of session.headers.getSetCookie())
      response.headers.append("Set-Cookie", value);
    return response;
  });
}
export function oauthExchange(request: Request) {
  return boundary(request, async () => {
    const body = await input(
      request,
      Schema.Struct({
        code: Nonempty,
        codeVerifier: Schema.String.pipe(Schema.pattern(/^[A-Za-z0-9._~-]{43,128}$/)),
      }),
    );
    return sessionResponse(
      await authenticate({
        grant_type: "authorization_code",
        code: body.code,
        code_verifier: body.codeVerifier,
        redirect_uri: `${new URL(request.url).origin}/auth/phone-callback`,
      }),
      "phone",
    );
  });
}
export function phoneCallback(request: Request) {
  const params = new URL(request.url).searchParams;
  const query = Schema.decodeUnknownEither(Callback)(Object.fromEntries(params));
  if (Either.isLeft(query)) return json({ error: "invalid_input" }, 400);
  return redirect(`q9chat://auth/callback?${new URLSearchParams(query.right)}`);
}
