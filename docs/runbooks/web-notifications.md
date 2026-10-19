# Desktop notifications

The web client uses the existing Web Push backend, including while its tab is
closed. The Convex deployment needs `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and
`VAPID_SUBJECT`. Set the web build variable `VITE_VAPID_PUBLIC_KEY` to the same
public key. No VAPID secret belongs in a browser environment variable.
The deploy workflow passes the GitHub repository variable
`VITE_VAPID_PUBLIC_KEY` into the web build. The release lane sets that variable
to the backend's public key before deployment.

Open a group and choose **Turn on** in the permission banner. Only that action
opens the browser permission request. **Not now** dismisses the banner until the
page reloads. If permission is blocked, allow notifications in the browser's site
settings and choose **Turn on** again. Browsers without Web Push do not show the
banner. Use HTTPS, or localhost for development.

Group info offers Mentions and replies (the default), All messages and Muted.
Existing server eligibility checks exclude the sender, muted groups and people
who lost membership. A focused tab renews a short viewing lease so its group
does not also interrupt through an OS notification. Sign-out unsubscribes the
browser and unregisters its server endpoint before ending its session. A durable
worker delivery switch and a serialized cleanup barrier suppress queued and
in-flight notifications. Push cleanup failure never prevents session sign-out;
the signed-out screen tells the person to quit the browser if cleanup fails.
Only the focused tab owns the viewing lease, using Web Locks. Browsers without
Web Locks omit foreground suppression rather than letting tabs overwrite it.

A subscription replacement stays in the browser PushManager and queues an
authenticated reconnect. Open pages synchronize it immediately. When no page is
open, a generic reconnect notification asks the person to open Q9 Chat. No access
token is stored in the worker; message delivery resumes after that signed-in
reconnect. This avoids silently losing alerts after an endpoint replacement.

Push links retain `/g/<groupId>?m=<sequence>` for compatibility with the phone.
The web route redirects into the authenticated group journey, which loads the
bounded history window around that sequence and centers/highlights the message.
Membership checks still apply when following an old notification.

The permission dialog and desktop notification are native browser/OS surfaces,
not the gallery's drawn stand-ins. Delivery timing and appearance belong to the
browser push service and OS notification settings.

## Journey proof

Run `tests/j8-web.e2e.ts` from Hasan's logged-in MacBook Air desktop, with Chrome's
macOS notifications allowed. It uses stable Google Chrome and a disposable
persistent profile. Set `Q9CHAT_CHROME_PATH` when Chrome lives outside its usual application
folder. Chromium's private contexts do not support push; some test builds use
Google's staging push service, which is deliberately outside the backend's
destination allowlist.

## Roll back

Installed service workers and push subscriptions survive a web-code revert.
To stop web delivery, remove `VAPID_PUBLIC_KEY` from the Convex deployment before
reverting this change. The existing sender does not dispatch web push when its
VAPID configuration is incomplete. This leaves phone delivery unchanged. Keep
the public key so it can be restored to enable the existing subscriptions again.
