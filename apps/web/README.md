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
are null outside a session. `verifyEmail` throws `EmailVerificationError` (exported
from the same module) with `code: "invalid_code"` for a rejected code or
`code: "invalid_transaction"` for a cancelled, expired or replaced email flow.
Render its `message` in the code screen's alert. Invalid transactions say
"That code has expired. Send a new one." and need `startEmail` again, not another
attempt with the same code. Other request failures throw `auth_unavailable`. OAuth buttons redirect to
`/api/auth/oauth/google?client=web` or `/api/auth/oauth/apple?client=web`.
The optional `returnTo` accepts only same-origin paths.

Only sign-out deletes `q9_session`. Terminal refresh failures return 401 without
a cookie write, so an old response cannot delete a newer account cookie.

Access tokens stay in provider memory. Convex calls `fetchAccessToken`, which
refreshes when requested or within 30 seconds of expiry. A shared promise coalesces
refreshes within the page. There are no cross-tab locks or queued cookie writers.
Sign-out dispatches immediately with `keepalive: true`, clears memory, and
broadcasts. Session generations discard stale in-memory results. Each tab
announces its user id on bootstrap or account change; peers holding a different
user discard their token and refresh from the shared cookie. BroadcastChannel
contains user ids only, never tokens. No token enters localStorage,
sessionStorage, or SSR markup.

Every sign-in requires a ten-minute httpOnly transaction cookie. Email start
creates an email-bound cookie, OAuth start creates the state/PKCE cookie, and
phone exchange preflight creates a verifier-bound cookie. Successful exchanges
consume their transaction. Wrong email codes keep it so the person can retry.
Sign-out clears the session and all three transaction cookies. A verify or
callback arriving after completed sign-out cannot exchange a code without a
transaction. A sign-in started before sign-out may still finish afterwards,
including a delayed email-start response restoring its transaction or an exchange
already running. Finishing still needs the emailed code or provider account;
v1 accepts this regardless of timing, including slow WorkOS responses. Refresh writes a cookie only when WorkOS returns a different refresh token.
An unchanged-token refresh cannot overwrite a newer account cookie; a genuinely
rotated token can still write last. Tabs reconcile to the resulting shared cookie. There is no server-side
transaction store.

## Worker endpoints

POST requests use JSON. Responses disable caching. Browser requests with a
foreign Origin are rejected. No cross-origin CORS permission is granted.

- `POST /api/auth/email/start { email }` returns `{ ok: true }` for a valid email,
  including when WorkOS refuses the challenge. It sets the email transaction cookie.
- `POST /api/auth/email/verify { email, code, client: "web" | "phone" }` returns a
  session while the matching email transaction exists. Missing, expired, or
  mismatched transactions return `401 { error: "invalid_transaction" }`.
  A wrong or expired code returns `401 { error: "invalid_code" }`.
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
- Before opening phone OAuth, `POST /api/auth/oauth/exchange { codeVerifier }`
  creates the ten-minute phone transaction cookie and returns `{ ok: true }`.
  The native HTTP client must retain that cookie, then send it with
  `POST /api/auth/oauth/exchange { code, codeVerifier }` to exchange the code.
  Missing, expired, or mismatched transactions return `invalid_transaction`.
  This preflight is required because opening WorkOS directly cannot create a
  first-party httpOnly transaction cookie on the Worker origin.
- `POST /api/auth/token { refreshToken? }` refreshes the session and returns
  `{ accessToken, expiresAt, user: { id, email, firstName, lastName }, method }`.
  `expiresAt` is Unix time in milliseconds. `method` is `email`, `google`, or
  `apple`. Missing or invalid sessions return `401 { error: "unauthenticated" }`.
- `POST /api/auth/sign-out { refreshToken? }` revokes the WorkOS session and
  clears the web session and every sign-in transaction cookie. A transient
  upstream failure throws `auth_unavailable`; retry sign-out to finish revocation.

Web refresh tokens live only in the httpOnly, Secure, SameSite=Lax cookie at
`Path=/api/auth`. Phone responses include `refreshToken` instead of a cookie.
Both forms wrap the WorkOS token and original method in an HMAC-signed value.
Clients treat that value as opaque and replace it on every refresh. This keeps
the method when WorkOS omits it in refresh responses. Signing uses the server-only
WorkOS key. Rotating that key invalidates local sessions. The web cookie expires
after 30 days from sign-in or token rotation; unchanged-token refreshes do not
extend it. WorkOS also enforces its session expiry.

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
and control its HTTP transport for cookie persistence, reload during pending
verification/sign-out, and two-tab OAuth bootstrap/account changes. The late
OAuth callback test uses the real Worker routes and Chromium cookie jar, with
no WorkOS call needed. Public-route tests separately exercise production server
code with only WorkOS and rate-limit bindings substituted.

CI requires the focused Chromium suite and `client-bundle.test.ts` after an
explicit app build (the contextual gate may skip its own build for docs-only changes). The bundle check scans built browser JavaScript for a
server-only secret canary and server API identifiers. The canary is configured
before the CI build; no staging secret is needed. These are mandatory CI steps,
not optional scripts or part of the concurrently running root test graph.

## Journey 1 browser proof

The root route uses the session for sign-in identity, `profiles.me` for setup
state, and a live `groups.list` subscription. Profile creation precedes an
optional authenticated photo upload. The gallery stays development-only.

The `e2e` suite uses real staging WorkOS and the `quixotic-crab-23` dev backend.
It reads the UI-created email challenge through the staging WorkOS API, not an
email inbox. A second user creates a group and sends a message through the
public Convex API while the first browser stays on its groups list.

With the web dev server on `http://localhost:3000` and staging credentials in
the process environment, run from the repository root:

```sh
pnpm test:e2e
```

Required environment: `WORKOS_API_KEY` (a staging key). The server also requires
`WORKOS_CLIENT_ID` in its ignored `.dev.vars`, and the root `.env.local` needs
`VITE_CONVEX_URL=https://quixotic-crab-23.convex.cloud`.

Run browser suites and full gates on test box. Never copy resolved credentials
into source or command arguments. Screenshots are written to `.e2e/results/` and collected under `artifacts/e2e-report/` on test box.
All interactions and assertions are exact, so no model provider or replay-cache
entries are needed; `.e2e/cache/` is committed for future recorded steps.

## Journey 2

New group searches the real people API, creates named groups, and opens an
existing or new pair for one selected person with no name. Group info adds
members and copies an invite URL using the current page origin. Member emails
are deliberately omitted; see [group member privacy](../../docs/group-member-privacy.md).

`/join/$token` keeps the invite URL through email sign-in and profile setup.
OAuth passes it through the existing same-origin `returnTo` parameter. Members
open the group directly; removed people and invalid links show plain copy.

Journey 3 extends the chat history; sending, search, notification settings,
removal and leaving remain outside these web journeys.

`tests/j2-web.e2e.ts` uses fresh staging email-code accounts and independent
browser contexts to verify live lists, member history, pair reuse and invite
joining. Run it with journey 1 using `pnpm test:e2e` on the disposable cloud test box.

## Journey 3

Conversation history keeps at most three live `messages.range` pages of 100 sequences.
The window opens around the captured read boundary, pages in either direction,
and drops off-screen pages. Jump to latest replaces it with the newest page and preceding context.
Opening captures the private read boundary once, places the unread divider before
an incoming post, and positions it 90px below the list top (clamped). Without a
divider, the list opens at the bottom. Paging preserves a visible message’s offset;
Jump to latest appears over 240px from the bottom. Live arrivals follow only when
already at the bottom and the window reaches the latest page. Otherwise the jump
control also indicates history outside the window. Keyboard activation focuses the
message log; typing status is a separate live region.

Visible posts advance `readStates.markRead` only in a focused, visible window.
Typing subscriptions expire locally as well as on the backend. Pair headers omit
the member count, and Group info never shows member email addresses. Quotes and
reaction counts are display-only. Attachment metadata is shown without fetching
protected files; rendering and playback belong to journey 4.

`tests/j3-web.e2e.ts` seeds fresh staging accounts and genuine dev history via the
public APIs. Run it with J1 and J2 using `pnpm test:e2e` on test box. It writes its
live flow screenshots to `artifacts/j3-round2/` and deletes its profiles and WorkOS users
in a cleanup, including on assertion failure.
