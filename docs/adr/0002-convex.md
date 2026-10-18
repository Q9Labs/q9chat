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
The web Worker uses the headless User Management API for email codes, Google
and Apple. The web session provider keeps the access token in memory and the
refresh token in an httpOnly cookie. It hands the access token to Convex. A
person's profile row links to their WorkOS user by the token's subject.

Deploy Convex from the web deployment workflow with `CONVEX_DEPLOY_KEY`, then
deploy the web Worker.

## Consequences

Session tokens stay outside Convex. Each Convex deployment needs its own
`WORKOS_CLIENT_ID`. The Worker needs server-only `WORKOS_API_KEY` and
`WORKOS_CLIENT_ID`, and WorkOS must register both callback URLs for each origin.
