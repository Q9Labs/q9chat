# Web deployment

The web Worker is named `q9chat-web` and is configured in
`apps/web/wrangler.jsonc`.

## Preconditions

- Confirm the target environment and branch.
- Set `CLOUDFLARE_API_TOKEN` and `CONVEX_DEPLOY_KEY` in the deployment
  environment.
- Set `WORKOS_CLIENT_ID` on the Convex deployment and `VITE_CONVEX_URL` for
  the web build. Set server-only Worker secrets `WORKOS_API_KEY` and
  `WORKOS_CLIENT_ID`. Keep credential values out of Git.
- Register `/api/auth/callback` and `/auth/phone-callback` on the web origin
  with WorkOS.

## Deploy

```sh
pnpm install
pnpm build
pnpm convex:deploy
pnpm deploy:web
```

The CI workflow deploys only from `main`. Check `/api/health` and sign in after
deploying.

## Phone builds

Build and submit from `apps/mobile` with `eas build -p ios|android --profile production`
and `eas submit --profile production --id <build>`. The iOS submit needs an App
Store Connect API key in `ascApiKeyPath`, `ascApiKeyId` and `ascApiKeyIssuerId`
(1Password, Mobile App Releases); keep that path out of Git. Roll back the web
Worker with `wrangler rollback` to the previous version.
