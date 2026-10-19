# Verify phone text sending

The J4 native tests use real staging sign-in and dev Convex. Run them on an iOS
simulator and Android emulator with the development client already installed.
Use Node 24 and pnpm 11. Queue each native run through the shared M4 lock.

## Network setup

Start the Worker on port 3000 and Metro on port 8097. For this test only, set
`EXPO_PUBLIC_CONVEX_URL=http://localhost:8321` before starting Metro. Keep
`EXPO_PUBLIC_CONVEX_SITE_URL` pointed at the dev Convex HTTP origin.

Run the native transport proxy from the repository root:

```sh
node tests/support/phone-network.ts
```

To use a different Worker port, set `J1_AUTH_ORIGIN` for the test and
`EXPO_PUBLIC_AUTH_ORIGIN` for the app to that Worker's origin. Set
`J1_PHONE_METRO` to the chosen Metro origin. Do not reuse another lane's servers.

It forwards HTTP and WebSocket traffic to dev Convex. The journey cuts the app's
connection through its loopback control endpoint, sends offline, restores the
connection, restarts the app and retries. It does not substitute backend functions.
The proxy stops after 20 minutes; stop it yourself when the run ends.

On Android, reverse ports 3000, 8097 and 8321 to the host. On iOS, localhost already
reaches the host. Supply the staging `WORKOS_API_KEY` privately to the test process.
The test creates and deletes its own staging accounts.

## Run

Set `J1_PHONE_UDID` and `J1_PHONE_METRO` for iOS, or `J1_ANDROID_SERIAL` and
`J1_PHONE_METRO` for Android. Then run one at a time:

```sh
pnpm exec e2e run --config e2e.phone.config.ts --grep 'J4:' --reporter list
pnpm exec e2e run --config e2e.android.config.ts --grep 'J4:' --reporter list
```

The test checks live delivery to another member, outgoing and incoming typing,
a draft across leaving the group, failed-send persistence across a process
restart, exactly one delivered retry, lost membership and sign-out.

Restore the normal Convex URL after testing. Stop the Worker, Metro, proxy and
any test engine processes you started, then shut down the simulator or emulator.
Keep the devices for the next lane.
