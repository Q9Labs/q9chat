# ADR 0001: Runtime stack

- Status: accepted
- Date: `2026`

## Context

The generated `q9chat` application needs one small stack that works for
local development and Cloudflare Workers deployment.

## Decision

Use pnpm workspaces, Turbo, strict TypeScript, TanStack Start, Vite, Tailwind
CSS, Lingui with English and Arabic catalogs, OpenTofu, and `@q9labsai/*`
packages. Keep domain code in `@q9chat/core`, auth ports in
`@q9chat/auth`, environment parsing in `@q9chat/env`, and the web
edge in `@q9chat/web`.

## Consequences

The base stays variant-neutral. Backend, persistence, and contract details are
added by an overlay, while the same gate and deployment contract remains.
