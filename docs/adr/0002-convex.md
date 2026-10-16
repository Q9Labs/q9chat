# ADR 0002: Convex backend and WorkOS sign-in

- Status: accepted
- Date: 2026-10-16

## Context

Q9 Chat needs a typed, live backend and a sign-in service that works the same on
the web and on the phone without a second persistence layer.

## Decision

Use Convex's native `v.*` validators for the schema, including discriminated
unions, `v.id()` references and declared indexes. Keep backend functions in the
repository's top-level `convex/` directory and expose the generated API through
the workspace-only `@q9chat/convex` package.

Use WorkOS AuthKit for sign-in. `convex/auth.config.ts` trusts the two WorkOS
token issuers for `WORKOS_CLIENT_ID` and verifies them against the WorkOS keys.
The web app signs in with `@workos-inc/authkit-react` and hands its access token
to Convex. A person's profile row links to their WorkOS user by the token's
subject.

Deploy Convex from the web deployment workflow with `CONVEX_DEPLOY_KEY`, then
deploy the web Worker.

## Consequences

Sign-in has no tables or secrets inside Convex. Each Convex deployment needs its
own `WORKOS_CLIENT_ID`, and the WorkOS dashboard must list each web address as a
redirect URI and allowed origin.
