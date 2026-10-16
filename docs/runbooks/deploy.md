# Web deployment

The web Worker is named `q9chat-web` and is configured in
`apps/web/wrangler.jsonc`.

## Preconditions

- Confirm the target environment and branch.
- Set `CLOUDFLARE_API_TOKEN` and `CONVEX_DEPLOY_KEY` in the deployment
  environment.
- Set `WORKOS_CLIENT_ID` on the Convex deployment, and `VITE_CONVEX_URL` plus
  `VITE_WORKOS_CLIENT_ID` for the web build. Keep credential values out of Git.
- List the web address as a redirect URI and allowed origin in WorkOS.

## Deploy

```sh
pnpm install
pnpm build
pnpm convex:deploy
pnpm deploy:web
```

The CI workflow deploys only from `main`. Check `/api/health` and sign in after
deploying.
