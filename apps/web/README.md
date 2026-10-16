# `q9chat` web

The TanStack Start web app for Q9 Chat. It runs on Vite during development and
deploys as a Cloudflare Worker through `wrangler.jsonc`.

```sh
pnpm dev
pnpm build
pnpm e2e
pnpm deploy
```

Sign-in uses WorkOS AuthKit's hosted pages through `@workos-inc/authkit-react`;
`src/lib/convex.ts` passes the AuthKit access token to Convex. The build needs
`VITE_CONVEX_URL` and `VITE_WORKOS_CLIENT_ID`, and nothing secret reaches the
Worker. `/api/health` returns `{ ok: true }`.
