# Q9 Chat phone app

An Expo app (SDK 58, expo-router, Hermes) that shares `@q9chat/convex` and `@q9chat/domain` with the web app.

## Settings

Copy `.env.example` to `.env`. Expo bakes `EXPO_PUBLIC_*` values into the bundle, so restart Metro after a change.

| Name                           | Meaning                                                                               |
| ------------------------------ | ------------------------------------------------------------------------------------- |
| `EXPO_PUBLIC_CONVEX_URL`       | The Convex cloud URL, such as `https://quixotic-crab-23.convex.cloud`.                |
| `EXPO_PUBLIC_CONVEX_SITE_URL`  | The Convex HTTP origin for uploads and photos. Derived from the cloud URL when unset. |
| `EXPO_PUBLIC_AUTH_ORIGIN`      | The web Worker that serves `/api/auth/*` and `/auth/phone-callback`.                  |
| `EXPO_PUBLIC_WORKOS_CLIENT_ID` | The WorkOS client id of the environment the Convex deployment trusts.                 |

## Sign-in

The phone talks to the web Worker for email codes and for the OAuth code exchange, and to Convex for everything else.

- The Worker's transaction cookies are kept in a small jar in `src/session/cookies.ts`, because React Native has no browser cookie store.
- Google and Apple open a system auth session at the WorkOS authorize URL (PKCE, S256) with `<AUTH_ORIGIN>/auth/phone-callback` as the redirect. The Worker page sends the browser on to `q9chat://auth/callback`, and the app trades the code for a session through `/api/auth/oauth/exchange`. The WorkOS staging app lists `http://localhost:3000/auth/phone-callback` for this.
- The session lives in SecureStore. Convex gets its access token through `ConvexProviderWithAuth`.
- `src/session/core.ts` owns every session change (restore, refresh, sign-in, sign-out, the OAuth attempt). It reads the refresh token from SecureStore inside each operation and keeps none in memory (except the one a sign-out holds to revoke), and a change that finishes after a newer one is dropped. `tests/session-client.test.ts` drives it with a fake Worker, keychain and auth window.
- A saved session that cannot be checked (no connection, keychain error) stays saved and shows "Can't connect. Try again." with a retry on the button and when the app returns to the foreground. Only a 401 from the Worker signs the person out.
- Sign out deletes the saved token from SecureStore, then shows "Signed out", so it works offline. If the delete fails the person stays signed in and a toast says so. The Worker revoke runs afterwards, three tries while the app lives, and nothing about it is saved: if the app ends first, the server session runs out by itself.

## Checks

```sh
pnpm --filter @q9chat/mobile typecheck
pnpm --filter @q9chat/mobile test
```

`test` runs the Node unit tests (`tests/*.test.ts`); the files they import use `.ts` import paths so Node can load them without a bundler.

The journey 1 end-to-end test drives the dev client on an iOS simulator against dev Convex and a Worker on `http://localhost:3000`. It needs `WORKOS_API_KEY` (a staging key) in its environment, `J1_PHONE_UDID` for the simulator, and `J1_PHONE_METRO` for the Metro URL:

```sh
pnpm exec e2e run --config e2e.phone.config.ts --target ios
```
