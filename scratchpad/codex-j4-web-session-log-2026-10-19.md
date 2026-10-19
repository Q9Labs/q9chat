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

### Checked implementation and final verification in flight

- 15950b9 committed and pushed without rewriting history. The normal hook ran on an index-identical Testbox checkout (tree 1f0dc96341100c2cf6ba5be062df8a0fd617e370): `20 passed, 0 failed, 0 skipped in 73324 ms`. Required React Doctor passed; optional React Scan is unavailable. The cloud checkout needed complete Git ancestry plus ShellCheck/actionlint before all lanes could run.
- All five data-safety cases passed on the fixed preview: socket-blocked account switch, duplicate-tab composition, stale-tab newer-draft preservation including reload, per-entry recovery including two reloads and same-key retry, and deleted receipt outside the loaded window.
- Final fixture rerun against the unchanged ca49426 app source again reproduced account replay as B, two committed copies of one composition, damaged-entry draft loss, and excessive history projection/render calls. The stale-tab test's reload was intermittent, so its persisted draft is now asserted before navigation as well; that exact assertion fails on ca49426 with `expected "" to be "Newer unsent tab A draft"`. The fixed case still requires the real reload to preserve the text. Navigation failures are not counted as red proof.
- The render probe now focuses the editor, waits for the resulting visible-row read state, then requires three quiet coverage samples before measuring. This separates focus/read-state/layout work from draft keystrokes. Final-source J4 isolation, J4 core, J1, J2 and J3 are running sequentially on Testbox task 5a9dc34c25d8, execution session 55068. The verified 93-file browser/source manifest is a9b927ba7c072c427eb138174ace00316bcfe061cd0115db080eade375fe9efe. No source edits during this run.
- A final small accessibility correction makes the textarea's invalid flag use the same trailing-whitespace normalization as the send button/body check; the core browser test directly asserts that 4,000 characters plus trailing whitespace is not invalid.

- Diagnostic incident: a one-time staging challenge code for an isolated throwaway probe was accidentally printed while inspecting an API response. It was immediately consumed in memory, replay was verified rejected, and the probe user was deleted and verified absent. No permanent API key or session credential was printed. The code itself is not recorded in project files or this log.

## Restart recovery and final handoff

- Resumed in the same worktree/branch after T3 restart. Testbox 5a9dc34c25d8 expired; receipt records TTL sweep, `cleanup_verified: true`, 7,235.393 seconds wall time and estimated $0.14322 compute. A fresh live `testbox.py list` showed no Droplets. Its final suite result was not collected, so it is not counted as green.
- Checked all ten requested items against 15950b9 and the remaining diff: account-scoped transports, per-tab drafts, key-local quarantine, polite failure/keyboard Retry, old deleted receipt retirement, pagehide/hidden typing stop, isolated typing/composer subscriptions, clearing typing errors and simplified loadText are in 15950b9. Normalized send/disabled checks are there too; the remaining composer change aligns aria-invalid. Existing red proof above is retained without rerunning ca49426.
- Reviewed the four-file remaining diff and retained its stronger stale-tab durability checks, explicit input-phase reporting and normalized invalid-state assertion. No new feature or backend change. The single prior scoped CLI review is recorded above; both findings are addressed in 15950b9, and it is not rerun.
- Replacement Testbox 9043dc58ec8d rejected a session-log change during provisioning and verified cleanup ($0.01 estimate). Testbox aaf13085400c owns the final hook, final-commit gate and J1/J2/J3/J4 core/isolation proof. Driver execution session 50120; launcher/receipt under /Users/macmini/.local/state/testbox/aaf13085400c. No heavy checks run on the Air.

- 18b0068 passed its normal hook (20/20), full gate and 11 session tests. Source proof matched all 93 web/browser files with a clean checkout. J1 passed (3 tests, one optional capture skipped); J2 passed. Four interrupted-run WorkOS accounts were deleted and verified, with two remaining profiles deleted.
- J3 then failed at the two-person typing assertion after sequential single starts separated by checks/screenshots; the backend expires typing at five seconds. Its fixture now renews every intended active peer before each count, preserving the same exact-copy, layout and eventual-expiry assertions. J4 stopped at its failure-retry reload waiting 30 seconds for the page load event. Its three reloads now wait for document commit and retain their existing app-state/readiness assertions. No product change.
- CI on 18b0068 is blocked only by two synthetic invite fixtures from unrelated feat/j2-phone, fetched by CI's all-ref scan. Hasan directed that PR 14 owns the fix. An in-flight exact-fingerprint workaround was stopped before commit and removed; the branch stayed clean at 18b0068. Do not change Gitleaks here. After Hasan says PR 14 merged, merge origin/main normally (no rebase) and push.

- Fixture-only commit 9a3f48f passed the normal hook: `20 passed, 0 failed, 0 skipped in 107750 ms`, then pushed. The follow-up account audit found zero remaining owned test accounts.
- Hasan confirmed PR 14 merged as 008d839. With no browser run active, fetched origin/main and performed a normal non-rebased merge; all files merged automatically, including session tests, changelog and tracker. The merged gate uses HEAD-only Gitleaks. Preparing the normal merge hook and final merged-source proof before pushing the merge commit.

- Normal merge c9a36a1 incorporated main 008d839 and was pushed; its normal hook passed 20/20 and GitHub CI is green (run 39197184146). Its full Testbox gate and 11 session tests also passed. One isolation attempt hit a transient WorkOS expired-code 401 during A's return sign-in; the unchanged account case then passed alone and in the next full run.
- The next isolation failure was an intended reload cancelled before document commit, after all stale-tab draft checks passed. Changing navigation APIs did not solve it. Diagnostics confirmed the main page remained open, then found Convex's beforeunload warning for in-flight typing mutations; the test runner dismisses unhandled native dialogs. Explicitly accepting that leave-page confirmation only around the intentional reload passed all three repetitions, each retaining the fresh performance.timeOrigin and exact restored draft assertions. Applied the same scoped confirmation handling to core J4's three deliberate reloads. No app/SDK warning behavior changed, and temporary diagnostics are not retained.
- Focused native-dialog proof completed: `Tests  3 passed (3)` in 96.04 seconds, with two leave-page confirmations explicitly observed. The first 15a48c8 hook invocation skipped remote staged planning because its mirror had no staged index; the follow-up proof-record commit stages the complete index-identical fixture/log mirror before invoking the normal hook. Final full gate and all five suites will use the resulting pushed commit.
