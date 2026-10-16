# Q9 Chat

A calm, fast, reliable team chat for the web and the phone.

Team chat apps grow into noisy work hubs. Q9 Chat does one job: groups where a
team talks, replies that quote, notifications only when something needs you,
and nothing a team has to manage. It is built by [Q9 Labs](https://q9labs.ai) on
Convex, WorkOS AuthKit, TanStack Start on Cloudflare Workers, and Expo. Read
[theory.md](theory.md) for what it is and why.

## Local development

Use Node 24 and pnpm 11. Never commit `.env` files or credentials.

First-time setup with a local Convex backend and no Convex account:

```sh
pnpm install
CONVEX_AGENT_MODE=anonymous pnpm exec convex dev --once
pnpm exec convex env set WORKOS_CLIENT_ID <client id from the WorkOS dashboard>
printf '\nVITE_CONVEX_URL=http://127.0.0.1:3210\nVITE_WORKOS_CLIENT_ID=<same client id>\n' >> .env.local
pnpm dev
```

The first command starts a local anonymous deployment and writes
`CONVEX_DEPLOYMENT` into `.env.local`. Convex refuses to push until
`WORKOS_CLIENT_ID` is set, because it verifies every access token against that
WorkOS client. In the WorkOS dashboard, add the local web address as a redirect
URI and an allowed origin.

The web app runs on the Vite URL printed by `pnpm dev`. Its health route is
`/api/health`.

## Layout

- `convex/` holds the schema and backend functions. `convex.json` and
  `.env.local` live at the repository root.
- `packages/convex` exposes the generated Convex API to the apps.
- `apps/web` is the TanStack Start web app.

## Verification

```sh
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
pnpm build
pnpm gate
```

`pnpm gate:full` runs all configured lanes. Baselines live under
`gates/baselines/` and change only through the gate CLI.

## Deployment

See [docs/runbooks/deploy.md](docs/runbooks/deploy.md). Confirm the target
environment before every deployment.
