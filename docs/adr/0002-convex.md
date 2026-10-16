# ADR 0002: Convex backend

- Status: accepted
- Date: `2026`

## Context

The generated `q9chat` application needs a typed backend that supports
the sample domain, authentication, local development, and Cloudflare Workers
deployment without a second persistence layer.

## Decision

Use Convex's native `v.*` validators for the schema, including discriminated
unions, `v.id()` references, and declared indexes. Use the
`@convex-dev/better-auth` component for Better Auth so authentication routes
and persistence stay inside the Convex deployment. Keep deployable backend
functions in the repository's top-level `convex/` directory. Run `convex codegen`
from the repository root before quality checks and expose the generated API
through the workspace-only Convex package.
Deploy Convex from the web deployment workflow with `CONVEX_DEPLOY_KEY`, then
deploy the web Worker.

## Consequences

The overlay has one typed backend contract and one deployment sequence. The
Convex package remains the stable import boundary for application code, while
the backend and its generated files stay at the repository root. Convex
generated files remain local build output, while the deployment workflow needs
an explicitly configured Convex deploy key in its repository secrets.
