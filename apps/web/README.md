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
refreshes when requested or within 30 seconds of expiry. A shared promise and
Web Lock serialize refreshes within the page and across tabs. No token enters
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
  clears the OAuth transaction, and redirects to the saved path.
- `GET /auth/phone-callback?code&state` redirects to
  `q9chat://auth/callback?code&state`. The phone checks its own state.
- `POST /api/auth/oauth/exchange { code, codeVerifier }` exchanges a phone code.
- `POST /api/auth/token { refreshToken? }` rotates the session and returns
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

`workos.server.ts` owns all WorkOS calls. Each call has a ten-second deadline,
retries only HTTP 5xx twice with exponential delay, and returns typed errors.
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
