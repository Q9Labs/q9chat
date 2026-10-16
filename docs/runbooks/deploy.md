# Web deployment

The web Worker is named `q9chat-web` and is configured in
`apps/web/wrangler.jsonc`.

## Preconditions

- Confirm the target environment and branch.
- Set `CLOUDFLARE_API_TOKEN` in the deployment environment.
- Set the five documented environment keys through the approved runtime secret
  and variable mechanism. Keep credential values out of Git.

## Deploy

```sh
pnpm install
pnpm --filter @q9chat/web run build
pnpm deploy:web
```

The CI workflow deploys only from `main`. Verify the health route after deploy
and record the live revision in the release notes.
