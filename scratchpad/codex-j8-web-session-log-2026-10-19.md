# J8 web notifications

- Read journey brief and shared quality bar. Leaf implementation phase only; judge and merge belong to lead.
- Started `feat/j8-web-notifications` from fetched `origin/main`.
- Existing backend supports Web Push. Added browser worker, explicit permission banner, device registration/viewing heartbeat and local unsubscribe before sign-out.
- Wired group notification settings. Bounded history loads the destination page and centers/highlights its message.
- M4 workspace: `/tmp/q9chat-j8-web-20261019/repo`; heavy jobs use `lockf /tmp/q9chat-m4.lock`. Web typecheck passed. Development backend deployed; no production access.
- Browser proof queued behind other M4 lanes. Actual push-service delivery not yet proven.
- Baseline screenshot captured from origin/main journey files using the running app. The browser attempt reached enrollment and hit Chromium's explicit incognito Push API prohibition. Test now uses an owned disposable persistent profile; no Push API stubs.
- Preserved backend `/g/<group>?m=<sequence>` payload for phone compatibility; added web route redirect instead. Public VAPID key uses the existing VITE_VAPID_PUBLIC_KEY build variable; final diff needs no backend change.
- Added setup/recovery runbook, release note and test-presence links to the journey E2E.
- Corrected proof polling: asynchronous Playwright predicates were not waiting for subscription. Real awaited polling exposed native AbortError: push service not available. Public VAPID point matches development configuration; backend key-import probe passed. Full Chromium persistent-context experiment queued.
- Installed matching full Chrome for Testing on the M4. The clean E2E created a real browser push subscription; registerWeb then rejected it in validateWeb (not validateKeys). An isolated provider-metadata probe is queued; no endpoint token or key values are logged.
- Provider probe returned Google's staging host jmt17.google.com, with valid 65-byte public and 16-byte auth keys. Convex parsed the normal fcm.googleapis.com URL correctly and allowed it. Kept the backend allowlist unchanged; queued task-owned stable Chrome plus the real journey, normal hooks and final gate. Temporary runtime probe was removed from both source and development deployment.
- Stable Chrome enrolled successfully and the backend selected its device for the reply. The VAPID keys are configured, paired, and have a valid subject. The full E2E stopped waiting for the reply notification.
- Native desktop proof is blocked: M4 console UID is 0 and gui/501 does not exist. Headed Chrome failed to connect to Notification Center/display before opening. An immediate headless showNotification/getNotifications sample returned zero, which alone is inconclusive because native display is asynchronous. Do not count native delivery or notification-click as proven.
- Keeping the strict full journey test; it now requires a logged-in desktop. Completing independent headless message-link/settings/sign-out checks separately, without treating them as full notification proof.

- Reproduced old-message links loading the right bounded window but restoring the viewport to its bottom. Moved destination centering into the existing viewport layout owner so it records the centered anchor before live updates. The same browser visibility assertion is the regression check.
- Another lane owned port 3000. Independent proof uses temporary port 3088 overrides, restored before hooks and the final gate. No shared preview was stopped.

- Independent real-browser checks passed on the M4: real enrollment, both legacy message URLs, old-history centering, mute persistence, sign-out unsubscribe and cleanup. This does not prove native notification display or click; the strict full E2E remains blocked by the missing GUI session.
- Running normal hooks and final full gate; no production access. Judge and merge remain separate.

- Integrated main at 73d5942 after J9 merged. Reused its notification controls and removed this lane's duplicate settings implementation. The integrated independent browser check passed, including actual unsubscribe on sign-out.
- Normal hooks caught lint, route-search typing, hydration and complexity issues before a commit was created. Split browser subscription APIs from the component, made capability detection hydration-safe, kept destination positioning in the viewport owner, and declared the classic worker entry point. No gate ceilings were relaxed. Focused checks and the same independent browser run precede the next normal hook attempt.

- Independent real-browser checks passed on the M4: real enrollment, both legacy message URLs, old-history centering, mute persistence, sign-out unsubscribe and cleanup. This does not prove native notification display or click; the strict full E2E remains blocked by the missing GUI session.
- Running normal hooks and final full gate; no production access. Judge and merge remain separate.

- Rebased onto J7 search (9823569). Reused its shared root message query, bounded history window, highlight and viewport positioning; removed this lane's duplicate destination logic. Legacy phone-compatible /g links now redirect to that shared destination. Reproving the integrated path before the final gate.

## Review corrections

The integrated Chrome probe passed on 0ab090d and CI was green. Before the final gate, PR review found logout cleanup gating auth, cross-tab viewing ownership, refreshed subscriptions, and an in-flight delivery/logout race. Added a failing-before Node 24 regression for logout and a live browser unsubscribe-failure case. The worker now uses durable delivery state and serialized stop acknowledgement; logout unregisters while authenticated but always attempts session sign-out. Web Locks give one focused tab lease ownership. Refreshed subscriptions queue authenticated reconnect and show a generic repair alert when no page is open; no worker-held access token. Final proof and gate will run on the corrected commit.

The corrected source passed web/E2E typechecks, lint, fallow, and React Doctor. The headless browser passed real enrollment and worker subscription-change reconciliation, then demonstrated that headless Chrome reports both tabs focused. Strict headed J8 keeps the real-focus assertion. The independent headless probe instead asserts one held Web Lock plus a waiting second tab; actual OS focus remains part of the no-desktop proof gap.
