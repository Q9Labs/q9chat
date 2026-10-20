# Phone notifications

The phone uses Expo Notifications and the existing Convex Expo delivery path. Group settings are shared with the web: Mentions and replies by default, All messages, or Muted.

## Permission and account lifecycle

The groups list shows the mock's permission banner only after sign-in and profile setup. Not now persists for that profile on this phone. Turn on creates the Android message channel, opens the system permission dialog, and registers the Expo token after permission is granted. Denial shows “You can turn them on later in Settings”. Returning from Settings retries registration when permission has been granted.

Registration also refreshes at startup, when the app becomes active, and when the native token changes. A registration failure leaves the banner available for retry. The saved Expo token stays in the phone's secure store so sign-out can remove a registration even after a lost server response.

Sign out and Delete account wait for any in-flight registration, remove this phone's Expo device, then end the session or delete the account. If removal fails, the person remains signed in and can retry when connected. They do not silently leave a shared phone subscribed to the previous account.

## Opening a message

The app validates the backend's existing `/g/<groupId>?m=<sequence>` payload path and opens the exact message through Expo Router. It also accepts `q9chat://g/<groupId>?m=<sequence>`. Other routes and unsafe message sequences are rejected. Keeping the existing payload avoids a backend change or deploy.

Both the response listener and the last notification response are handled, covering background and cold starts. Navigation waits until the root navigator and signed-in profile are ready. A repeated response opens only once; tapping clears the notification. Membership checks remain on the existing group query.

In the foreground, a push for the conversation currently on screen has no banner, sound, badge, or notification-list entry. Other groups can notify. The server continues to enforce mute, mentions/replies, All messages, and exclusion of the sender.

## Credentials

- EAS project: `@q9labs/q9chat`, project ID `ca32262b-b798-4a89-bd97-bd051e71d5c4`.
- Android package: `ai.q9labs.chat`.
- Firebase: `q9chat-mobile-q9labs`, owned by `q9labs.ai@gmail.com`, Spark plan with billing disabled.
- FCM service account: `q9chat-expo-push@q9chat-mobile-q9labs.iam.gserviceaccount.com`, with `roles/firebasecloudmessaging.admin` only in this project.
- The FCM V1 key is assigned in EAS Android credentials and saved in 1Password **Mobile App Releases → Q9 Chat FCM service account**. The temporary M4 copy was deleted after EAS confirmed the assignment.
- `apps/mobile/google-services.json` is the Firebase Android client configuration, not the service-account private key. [Firebase documents these client keys](https://firebase.google.com/docs/projects/api-keys) as project identifiers rather than authorization credentials. The secret-scanner exception covers only the `current_key` field in this client file; private keys and other files remain scanned. Expo includes it through `android.googleServicesFile`.
- Apple team: CollabEZ FZE LLC, `5K9635LZ6F`. APNs key provisioning and assignment are owned by the separate browser lane. Do not revoke keys used by other apps.

## Running the proof

`tests/j8-push.e2e.ts` runs against dev Convex `quixotic-crab-23` and WorkOS staging. `e2e.push.config.ts` selects Android when `J8_PLATFORM=android`, otherwise iOS. It uses only the dedicated `q9chat-j1` devices and needs the development client plus Metro on port 8197 and the existing staging auth/network helpers on ports 3174 and 8321.

Queue native builds and device runs on the M4 with `lockf -k /tmp/q9chat-m4.lock`. Refuse a native build below 5 GB free. The `-k` option keeps the shared lock inode stable when another lane is queued. Build `@q9chat/convex` before running the test, because its runtime exports come from `dist`. The test uses ephemeral staging accounts and removes them afterward. Never point it at production.

Android checks actual delivery through the backend, Expo, and FCM before tapping the OS notification. It checks background and cold starts, visible-group suppression, All messages, muted mentions, sign-out, and account deletion. The AVD must include Google APIs and Google Play services.

The iOS fallback uses `xcrun simctl push` with an Expo-shaped APNs payload: `aps.alert` contains the visible title/body and `body.url` contains the destination. This proves native handling and navigation, not APNs delivery. Real iOS delivery still requires a separately recorded successful provider attempt or TestFlight proof.

Set `J8_REAL_IOS=1` for a real iOS delivery attempt after APNs credentials are assigned. Without it, iOS injects the native fallback payload and never claims provider delivery.

## Recorded outcome

The Android happy path passed with real Expo/FCM delivery, background and cold-start taps, visible-group suppression, All messages, muted mentions, offline sign-out retry, sign-out unregistration, and account deletion. The Google APIs AVD includes Google Play services.

The iOS simulator uses an Xcode-built development client with ad-hoc signing (`CODE_SIGN_IDENTITY=-`, `CODE_SIGNING_ALLOWED=YES`). An unsigned simulator build does not provide the keychain entitlements used by sign-in. No Apple distribution certificate or store release is involved in this simulator build.

The iOS fallback covers background and cold-start taps, visible-group suppression, group settings, and account actions. It does not prove Expo/APNs transport or real-device delivery. The release lane must record real iPhone delivery on a signed build before claiming that coverage.
