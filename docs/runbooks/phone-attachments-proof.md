# Phone attachments proof

Use Node 24 and pnpm 11 on the M4. Run native builds, device tests and the full gate
inside `lockf /tmp/q9chat-m4.lock`. Stop before a native build if the data volume has
less than 5 GB free. The staging credential is **Q9 Chat WorkOS Staging API key**
in the dev vault; inject it without printing it.

The native development client needs `expo-audio`, `expo-document-picker` and
`expo-sharing`. Rebuild each native client after installing those packages. For iOS simulator
builds, keep `CODE_SIGNING_ALLOWED=YES` and use `CODE_SIGN_IDENTITY=-`. Xcode
supplies the simulator application entitlement that SecureStore needs. Disabling
signing can let the app launch while every Keychain write fails.
Run Metro on port 8197 and the staging-auth Worker on port 3174. Set
`EXPO_PUBLIC_AUTH_ORIGIN=http://localhost:3174` and
`EXPO_PUBLIC_CONVEX_URL=http://localhost:8321` and
`EXPO_PUBLIC_CONVEX_SITE_URL=http://localhost:8321` for Metro. Start the existing
`tests/support/phone-network.ts` proxy on 8321. It forwards uploads and protected files to the dev HTTP origin. These ports must be free; do not touch another lane's
servers. See `phone-text-proof.md` for the transport-failure control endpoint.

Use the shared `q9chat-j1` simulator and AVD only while holding the lock. Before
each iOS run, uninstall `ai.q9labs.chat`, reset that simulator's Keychain and
reinstall the development client. A Keychain-only reset does not clear app files.
Seed
`tests/fixtures/attachment.jpg` into Photos/Pictures and a file named
`q9-attachment.txt` into the local Downloads folder. Grant microphone access.
On Android reverse ports 3174, 8197 and 8321 to the host.

```sh
pnpm exec e2e run --config e2e.phone.config.ts --grep 'J4b:' --reporter list --trace on
pnpm exec e2e run --config e2e.android.config.ts --grep 'J4b:' --reporter list --trace on
```

The journey signs in to staging, sends a photo and a file from the native
pickers, fails an upload, retries while offline, reconnects, plays a voice note,
observes delivery through another member's live subscription, and signs out. It also checks that removal hides the composer and attachments. It removes its own test accounts. It uses no agent-model calls.

Stop Metro, the Worker, the proxy and the test engine when the run ends. Shut
down the simulator or emulator, but keep both devices.

## Microphone proof split

The iOS simulator run sends a photo and file, opens and cancels the recorder,
receives a voice note from the other member and plays it through the protected
attachment path. It also checks failed upload, offline Retry, removal and sign-out.
The peer voice note is a twelve-second synthetic AAC test fixture.

Android exercises native recording and upload retry. The headless emulator has
audio input disabled, so a peer also sends the AAC fixture through the same
authenticated upload endpoint. Android verifies that fixture playback advances.
This does not prove live microphone audio. Recorder transition unit tests cover preparation, cancellation,
retry and stale native completions. Live microphone recording on a real iPhone
remains a TestFlight follow-up, not a simulator gate.
