# Journey 4 web text — session log

## Scope and decisions

- Started from origin/main e7621f3 on feat/j4-web-text. PR A only; no backend or auth/session changes, and no PR creation. Attachments wait for the lead's response.
- Confirmed host is Hasan's MacBook Air. Testbox c2f249916877 owns heavy checks and browser runs; driver session 93355, receipt under ~/.local/state/testbox/c2f249916877. Remote helper /tmp/j4-remote.py; normal local Git hook forwards actual lefthook execution to that box through /tmp/j4-lefthook.
- Contract requires pending sends to survive restart. Account/group-scoped local storage keeps drafts and separate per-clientKey outbox entries; restores interrupted sends as retryable. Mention autocomplete is absent from the approved composer and stays in Journey 6. Enter sends, Shift+Enter inserts a newline.

## J3 carry-overs

- Voice attachments announced as voice notes; author dialog resolves selected id against live rows.
- Extended J3 proof for deleted first-unread divider, direct own-arrival silence, live dialog deletion and an event-first held-slide anchor.
- First scoped web/e2e typechecks passed. Initial hook passed 14 lanes, 6 legitimately skipped by staged planning. Browser attempt 1 stopped at fixture auth: unrelated staging WorkOS key. Switched to Q9's existing dev deployment configuration without exposing secrets.
- Attempt 2 reached live author deletion; its new deleted fixture was still in refresh/cleanup, causing a 401. Removed that already-deleted fixture from future refresh/cleanup; proof rerun pending. Hook rejected unformatted added test lines; formatting corrected for the next normal hook.

## Text sending implementation and focused proof

- J3 carry-overs committed/pushed as 68f712f through normal hook; replied on Codex threads 4309169167 and 4309169168 with that commit.
- Durable account/group draft + per-post outbox, stable pending/live render keys, retry deduplication, body cap, typing lifecycle, Enter/Shift+Enter and latest-follow implemented with plain Convex. Attach/mic remain disabled pending PR B.
- Scoped web and e2e typechecks passed. First J4 browser run passed (58.24s): eight exact PASS lines cover real socket failures before/after commit, restart retry, drafts, key handling, body cap, pending node identity, typing throttling/stop and latest scroll. Fresh test profiles and WorkOS users cleaned up in finalizer.
- Approved v2 mock captured on Testbox for empty, typing, pending, failed and sent. Final contact sheets and complete J1–J4 run still pending.

## Gate and visual follow-up

- Full staged hook exercised all 20 lanes. Fixed a dead export, shared the repeated public-API sign-in fixture, and simplified the socket fault state handling and History's repeated error selection. One justified React Doctor suppression documents external localStorage synchronization (not a parent-state update).
- Installed ShellCheck and actionlint only on the disposable box. No project dependency changes.
- Screenshot review caught initial-loading composer placement and a redundant generic alert on failed sends; both fixed. Compact 390px audit also exposes the existing desktop-only shell: sidebar consumes most of the viewport. This pre-existing responsive/navigation work is outside the approved desktop J4 composer and is not claimed as supported.
- One scoped Codex CLI review started with --base origin/main; log /tmp/j4-code-review.log. Complete suites and final gate still running/pending. No additional review run will be started.

## Independent review and final regression pass

- Single Codex review completed successfully (3m47s): two confirmed edge cases. Acknowledgements now retire durable pending entries even when the committed row is outside the loaded history window; an in-memory delivered copy bridges the live query. A selected author whose sole row leaves the bounded window no longer leaves read tracking paused. Added browser regressions for both.
- First complete browser run passed J1, J2 and J4; J3 exposed a fixture error: its event anchor selected sequence 247, a post, because group creation writes two events. The regression now obtains the actual event sequence from the public group query.
- Refactored test setup and socket helpers to satisfy ordinary lint/complexity/duplication gates; no gates weakened. Final full hook and J1–J4 browser rerun in progress.

## Green text commit and remaining final proof

- f8bb93a committed/pushed through the normal hook on Testbox: all 20 lanes passed. Node 24.21.0, pnpm 11.1.3. Local requested Git-range gitleaks scan passed (2 commits, no leaks). Source hashes match the checked clone. No backend or auth/session product files changed.
- Combined browser pass lines: J1 128.82s (optional reference-capture test skipped), J2 111.81s, J4 116.45s including acknowledgement outside the displayed window. J3's new event-anchor and author-eviction regressions passed, then its final capped-member fixture incorrectly reused Dina after the preceding deletion test. It now uses seven fresh members, keeping the same cap/count assertion.
- All seven two-wide contact sheets opened; desktop empty/typing/pending/failed/sent match the approved composer states. Initial gallery preview has no console errors. Files live under the journal build/j4-web/text directory.
- A further contract edge case needs proof: retry may return an already-deleted committed message. Reconciliation must also recognize its receipt id because deleted rows do not carry clientKey. Added a real socket/API regression; first run stopped earlier on a navigation load timeout after the source-copy HMR storm. Restarting the owned Vite process before the targeted reproduction. No product fix applied before reproduction.
- origin/main advanced independently to c987b69 (unit-test timing changes). This feature's three-dot diff does not touch auth/session files, and git merge-tree reports a clean merge with current main.

- After the clean server restart the deleted-retry regression reproduced the bug exactly: the server's deleted placeholder appeared, but one cached text bubble remained (expected zero). Reconciliation now also matches the successful receipt's message id against loaded rows, including deleted rows. Re-running the identical regression, full J3 fixture and normal hook on that fix.
- Reconciliation filters the current external-store snapshot, preserving concurrent acknowledgements and newer drafts rather than writing a render-time copy back. Added overlapping-send proof for distinct keys, one committed post each and preservation of a draft typed while both are pending. Final J3/J4 now run independently on the same immutable preview source.

## Final product proof

- Final J3 browser suite passed: `tests/j3-web.e2e.ts (1 test) 430.70s`, including all carry-overs, event-line anchor preservation, deleted-first-unread divider, own-send silence and author-dialog eviction. Finalizer submitted all 8 remaining fresh profiles for deletion, removed WorkOS accounts and closed peer contexts.
- Final J4 browser suite passed: `tests/j4-web.e2e.ts (1 test) 127.39s`, with all 11 exact PASS lines, including response-failure deduplication, restart retry, already-deleted retry, overlapping sends/newer draft preservation, body cap, keyboard behavior, drafts and typing lifecycle. Its profile/account/context cleanup passed.
- Alongside the earlier passing J1/J2 lines, all four requested suites are green on Testbox. The single skipped J1 case is optional approved-reference capture, not product behavior.
- Final normal hook: all 20 lanes passed; required React Doctor passed, optional React Scan was unavailable. Feature commits 68f712f, f8bb93a and 32800b1 pushed. Requested Git-range gitleaks scan is clean. No PR opened; no feature-branch CI is triggered by this repository (CI runs on PRs and main).
- Final five mock/live sheets plus before/after and compact audit refreshed and all opened. Interactive contact sheet preview loads all seven images with no errors. Desktop proof only: existing 390px navigation/layout remains unusable, documented in the compact sheet. Voice arrival wording is source-verified; physical screen-reader speech was not exercised.
- Final cleanup/account audit and cloud teardown receipt are saved alongside the sheet artifacts. The cloud box is released after this proof-note commit completes its normal hook; PR B has not started.

## PR 13 review corrections

Read the full independent review and all three Codex comments. The account transport must be retired before HTTP identity transitions, not just remounted. Drafts are deliberately per-tab (sessionStorage), while retry keys remain account/group-scoped in localStorage. Malformed pending entries are recovered independently and quarantined by key.

On the original ca49426 source, both cross-tab browser interleavings failed at the intended assertions: a duplicated sendable composition and a newer draft erased by the stale tab. Account replay and damaged-entry recovery are still awaiting a clean targeted reproduction; startup/navigation errors do not count as regression proof.

### Baseline reproduction and chosen fixes

- All three required regressions now fail at their intended assertions on the unchanged ca49426 app source: the socket-blocked A body was committed as B after HTTP account switching; two tabs committed the same restored composition twice; a stale tab erased the newer tab's draft; and malformed pending JSON discarded a valid retry plus the draft. Setup/navigation failures were excluded from this evidence.
- Drafts now belong to a tab, account and group via sessionStorage. They survive reload/group switches in that tab, not tab closure, and do not synchronise across tabs. Pending sends remain durable account/group/clientKey localStorage entries. No backend/auth endpoint changes.
- A successful receipt of an old deleted post was also reproduced outside the loaded window (first loaded sequence 201, deleted sequence 3): the old source retained one cached body. A fresh view restores the durable retry without releasing the first socket's intentionally held query frames.
- The 300-row probe (298 posts, two system events) counts actual V8 function calls, not committed React renders or latency. Positive-control row edits prove the instrumented functions are observed. Before changes: drafting called historyMessages 200 times and Timeline/buildTimeline 112 times each; typing start/stop called them 8/6/6 times. StrictMode is enabled. The fix isolates typing query/expiry and draft subscriptions; no broad memoisation was introduced.
- The single scoped CLI review completed and identified provider cleanup against an already-closed SDK client plus a socket-close handshake delaying HTTP logout. Both causal paths were fixed: detach the authenticated SDK subtree synchronously before disposal, start HTTP logout without waiting for the socket handshake, and do not let an old completion clear the next account. All 11 session unit tests, including the stalled-close regression, pass on Testbox; web and browser-test typechecks pass.
