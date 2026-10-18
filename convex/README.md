# Q9 Chat backend

Convex owns membership, history, read state, bytes and delivery eligibility.
Apps consume the generated API through `@q9chat/convex` and pure helpers through
`@q9chat/domain`.

## Verify locally

```sh
pnpm typecheck:convex
pnpm --filter @q9chat/domain typecheck
pnpm test:backend
pnpm lint
```

The backend suite calls public functions with `convex-test.withIdentity` and
mocks only outbound fetch, with transaction limits enabled. The root Turbo test
command includes this suite through `@q9chat/convex`. The test cron adapter fires the actual registered
cron definitions because convex-test does not run recurring jobs itself.
Scheduled failures are checked, including the intentionally failed deletion
step used to prove cron recovery.

## Deployment environment

- `WORKOS_CLIENT_ID` and `WORKOS_API_KEY`: token audience and server-only user lookup/deletion.
- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`: Web Push signing.
  Missing VAPID configuration skips web delivery with one warning per runtime.

Files are authenticated HTTP responses, not public storage URLs. The upload
route sniffs media signatures and assigns a single consumable kind. Unknown
file types are served as `application/octet-stream`. Browser subscriptions are
restricted to HTTPS browser push-service hosts to prevent arbitrary dispatch
URLs. Web viewing leases last 60 seconds; typing leases last 5 seconds.

Removal and read cleanup jobs carry immutable sequence cutoffs. Reaction rows
are cleaned in batches after deletion; post counts disappear transactionally.
Account deletion is retried by the ten-minute cron and retains the auth-id
lock until one hour after WorkOS deletion before replacing it with a tombstone.

Voice sniffing uses only container signatures (Ogg, WebM/EBML, MP4/M4A and
ADTS AAC), not codec markers or track parsing. A crafted signature may produce
an unplayable voice note; v1 accepts this. An upload can only be consumed as
its recorded kind. Real ffmpeg fixtures cover these classifications.

List and timeline queries share a promise cache for people, and added events
resolve only three names plus an others count. Mentions return profile IDs.
Push previews stop at 200 Unicode code points. Each retry rechecks membership,
notification preferences, device ownership and viewing before rebuilding its
payload. Immediate dead-device responses remove only the unchanged subscription;
v1 does not poll Expo receipts.

The codegen drift gate uses `convex codegen --system-udfs --typecheck disable`
to regenerate this component-free backend offline. Convex typechecking runs as a
separate gate; generation needs no deployment credentials or deployment changes.
