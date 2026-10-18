# `q9chat` web

The TanStack Start web app for Q9 Chat. It runs on Vite during development and
deploys as a Cloudflare Worker through `wrangler.jsonc`.

```sh
pnpm dev
pnpm build
pnpm e2e
pnpm deploy
```

## Session client

The root mounts `SessionProvider` and `ConvexProviderWithAuth`. Screens use one module:

```tsx
import { useSession } from "../lib/session.js";

const { status, user, method, startEmail, verifyEmail, signOut } = useSession();
await startEmail(email);
await verifyEmail(email, code);
```

`status` is `loading`, `authenticated`, or `unauthenticated`. `user` and `method`
are null outside a session. `verifyEmail` throws `invalid_code` for a rejected
code. Other request failures throw `auth_unavailable`. OAuth buttons redirect to
`/api/auth/oauth/google?client=web` or `/api/auth/oauth/apple?client=web`.
The optional `returnTo` accepts only same-origin paths.

Access tokens stay in provider memory. Convex calls `fetchAccessToken`, which
refreshes when requested or within 30 seconds of expiry. A shared promise coalesces refreshes within the page. A Web Lock serializes
all cookie writers (verification, refresh, and sign-out) across tabs. Session
generations discard stale results; sign-out waits for older cookie writes before
clearing the cookie. BroadcastChannel carries only signed-out/changed notices,
invalidating other tabs without sending or storing tokens. No token enters
localStorage, sessionStorage, or SSR markup.

## Worker endpoints

POST requests use JSON. Responses disable caching. Browser requests with a
foreign Origin are rejected. No cross-origin CORS permission is granted.

- `POST /api/auth/email/start { email }` returns `{ ok: true }` for a valid email,
  including when WorkOS refuses the challenge.
- `POST /api/auth/email/verify { email, code, client: "web" | "phone" }` returns a
  session. A wrong or expired code returns `401 { error: "invalid_code" }`.
- `GET /api/auth/oauth/$provider?client=web` accepts `google` and `apple`, creates
  a ten-minute signed state and PKCE cookie, and redirects to WorkOS.
- `GET /api/auth/callback?code&state` exchanges the code, sets the session cookie,
  clears the OAuth transaction, and redirects to the saved same-origin URL.
  Cancellation, invalid state, and upstream failure also clear the transaction
  and redirect to `/auth/error` with a fixed safe reason. Concurrent callbacks
  rely on WorkOS single-use authorization codes; the cookie is not a server-side
  atomic transaction store.
- `GET /auth/phone-callback?code&state` redirects to
  `q9chat://auth/callback?code&state`. The phone checks its own state.
- `POST /api/auth/oauth/exchange { code, codeVerifier }` exchanges a phone code.
- `POST /api/auth/token { refreshToken? }` refreshes the session and returns
  `{ accessToken, expiresAt, user: { id, email, firstName, lastName }, method }`.
  `expiresAt` is Unix time in milliseconds. `method` is `email`, `google`, or
  `apple`. Missing or invalid sessions return `401 { error: "unauthenticated" }`.
- `POST /api/auth/sign-out { refreshToken? }` revokes the WorkOS session and
  clears the web cookie. A transient upstream failure is retryable.

Web refresh tokens live only in the httpOnly, Secure, SameSite=Lax cookie at
`Path=/api/auth`. Phone responses include `refreshToken` instead of a cookie.
Both forms wrap the WorkOS token and original method in an HMAC-signed value.
Clients treat that value as opaque and replace it on every refresh. This keeps
the method when WorkOS omits it in refresh responses. Signing uses the server-only
WorkOS key. Rotating that key invalidates local sessions. The web cookie expires
after 30 days; WorkOS also enforces its session expiry.

`workos.server.ts` owns all WorkOS calls. Each call has a ten-second deadline and typed errors.
Only idempotent session revocation retries HTTP 5xx twice with exponential delay.
Code creation, one-time authentication grants, and refresh grants never retry.
No Effect runtime is used for application state.

## Local configuration and checks

The browser needs `VITE_CONVEX_URL` at the workspace root. The Worker needs
`WORKOS_API_KEY` and `WORKOS_CLIENT_ID` in ignored `apps/web/.dev.vars`, or Worker
secrets outside local development. Never put the API key in a `VITE_` variable.
Register both callback URLs with WorkOS for each origin.

With the Worker preview running on port 3000 and staging Magic Auth enabled:

```sh
AUTH_TEST_ORIGIN=http://localhost:3000 node --test apps/web/tests/auth.test.ts
```

The test calls public routes and staging WorkOS with reserved example.net
addresses. It retrieves a code through the staging API, checks wrong-code
handling, signs in, refreshes, checks refresh persistence and Convex JWT acceptance, and signs out.
Convex authenticates the Bearer token before resolving a deliberately missing
function. A malformed-token control returns 401. The valid token passes auth and
reaches function resolution. This does not prove the value of `ctx.auth` inside
a deployed function. No identity-reading function exists on this branch, and no
test function is deployed. OAuth redirect checks do not require click-through.

Token responses accept only MagicAuth, GoogleOAuth, and AppleOAuth. Other methods
are revoked before returning `403 { error: "unsupported_method" }`. Refresh may
omit its method, in which case the signed original method is retained.

`node --test apps/web/tests/auth-policy.test.ts` checks the unsupported-method
rejection through the exported public email route. It replaces only WorkOS's
outside HTTP transport, returns a Password session, and asserts revocation and
a 403 response without a session cookie. It does not mock Q9 auth code.

## Abuse budgets and regression checks

Four Cloudflare Workers rate-limit bindings run before WorkOS: email start is
20/minute/IP and 3/minute/email; verification is 60/minute/IP and 10/minute/email.
Keys use Cloudflare's trusted `CF-Connecting-IP` (not forwarded headers) and a
SHA-256 digest of the normalized email. Missing IPs share an unknown bucket.
Email-start responses remain `{ ok: true }` when limited; verification returns
429 with `Retry-After: 60`. These are our own budgets, not a claim about WorkOS's
create-code endpoint limit. Cloudflare counters are per-location and eventually
consistent, not a strict global quota. Wrangler/Vite simulates them locally;
`rate-limit.test.ts` exercises the actual configured bindings.

`pnpm test` runs deterministic public-route, session lifecycle, and local binding
cases one file at a time. `pnpm test:staging` runs the separate live lane; it
finds `magic_auth.created` through the staging events API, then retrieves that
exact challenge. It never creates a replacement challenge.

The focused Chromium checks are `pnpm exec playwright test e2e/auth-session.spec.ts
--workers=1` (run on a disposable cloud box). They mount the real provider in a test-only harness
and control its HTTP transport, testing cookie persistence, delayed verify versus
logout, and two-tab invalidation. Public-route tests separately exercise the
production server code with only WorkOS and rate-limit bindings substituted.
