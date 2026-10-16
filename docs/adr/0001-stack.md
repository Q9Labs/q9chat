# ADR 0001: Runtime stack

- Status: accepted
- Date: 2026-10-16

## Context

Q9 Chat needs one small stack for a live, reliable chat on the web and the
phone, kept small enough that every part earns its place.

## Decision

Use Convex for data, authorization and live updates, with plain queries and
mutations. Use Effect only in actions and HTTP endpoints that call outside
services. Use WorkOS AuthKit for sign-in on every client. Build the web app with
TanStack Start, Vite and Tailwind CSS on Cloudflare Workers, and the phone app
with Expo. Use pnpm workspaces, Turbo, strict TypeScript and the `@q9labsai/*`
gate and UI packages.

The scaffold's sample domain, role model, own diagnostics pipeline, in-app
changelog, translation catalogs, preview gallery, OpenTofu stacks and mutation
testing were removed because no version 1 journey needs them.

## Consequences

The repository holds only the backend, the generated API package and the apps.
Anything removed here comes back only with a product reason.
