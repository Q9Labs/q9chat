# Journey 3 web

- Started from origin/main 265be3b on feat/j3-web. Auth/session and backend are outside scope.
- Read shared lane contract, mock inventory and presentation components. Attachments require authenticated file fetches; J3 will show type/name without fetching.
- Fixed PR #8 deleted-member Message visibility, removed-view info column and pending dialog dismissal.

## Journey 3 wired; verification in progress

- Replaced minimal history with existing presentation components and public live queries, stable opening unread boundary, paged sequence ranges, focused visible-post read cursors and expiring typing rows.
- Initial focused J3 run passed against dev Convex and staging WorkOS. Contact-sheet inspection caught typing falling below the viewport; bottom-follow now includes content-height changes. Final regression run remains required.
- PR #9 landed as cc293ed; merging main and using the normal hook. No gitleaks config workaround and no --no-verify commit used.
- Combined J1/J2/J3 attempt: J1 passed (optional mock capture skipped), J2 email-code locator failed. Investigation and final gates ongoing on testbox task 186605fadc5a.

## Final live proof

- All 20 gate lanes passed through the normal pre-commit hook. Main cc293ed is merged; no hook bypass was used.
- J1 passed with only its optional mock capture skipped. J3 passed in 176.17 seconds, including 30 unread posts with an interleaved own post, two older pages with exact scroll preservation, live arrival, muted activity elsewhere, typing expiry, post states, pairs and a 120-post unread backlog.
- J2 passed after its exact event copy was aligned with the approved chat components: the two-name list uses “and”, and the viewer sees “You joined”. Its cleanup now registers the fourth profile immediately after setup.
- The scoped review found the capped unread badge count could skip unseen history. The implementation now captures the private read cursor and loads back to it; the 120-post case proves the correction.
- Inspected all four two-column mock/live contact sheets under the journal build/j3-web folder. Attachment bytes and playback remain journey 4; this flow shows metadata only.
- Earlier failed attempts left three active test profiles after WorkOS cleanup. All three went through the standard dev deleteAccount mutation. The final audit found zero reserved WorkOS users, zero active test profiles, zero remaining personal rows or photos, and zero pending WorkOS deletions. Locked deletion markers remain for the documented one-hour token lifetime.

## Round 2 review fixes

- Accepted all six findings from review-j3-web-1.md. History now uses three reusable live query slots, pages both ways and evicts off-screen ranges; the opening read boundary remains frozen independently.
- Replaced height-delta anchoring with visible message ID/offset restoration. Jump transfers focus to the log; typing is outside its live region, with busy history paging. Corrected capped event conjunctions and metadata attachment keys.
- First revised J3 cloud run passed in 212.46s: 450 unread, maximum three live range subscriptions, and concurrent prepend deltas of 0.375px twice. Final-source regression run remains required.
- Contact-sheet inspection caught a premature muted-header capture and typing-height bottom-follow; both corrected with explicit assertions.
- The required scoped review found short latest-page backfill and reader movement while a page is pending. Added preceding context on open/jump and continued anchor tracking during loading, with cloud e2e cases.
- Normal hook initially blocked complexity, duplicated session exchange and a render-time passed callback. Refactored these; no hook bypass, threshold relaxation, backend or auth/session edits.

## Round 2 final verification

- Final-source testbox run: J1 (4 tests, 1 optional mock capture skipped) passed in 107.34s; J2 (1 test) passed in 101.51s; J3 (1 test) passed in 265.05s. Total: 3 files passed, 5 tests passed, 1 skipped.
- WebSocket query-set instrumentation measured 2 opening, maximum 3 and 2 final live messages.range subscriptions with 450 unread. Three reusable slots cap active pages at 100 sequences each; paging evicts the opposite edge. Both concurrent prepend anchors moved 0.375px, including reader movement while loading. The 101-post short latest page remained scrollable to older history.
- Enter-to-jump focus, PageUp, capped event copy, typing placement/expiry and the open muted header label and bell-off icon passed exact assertions. Inspected all five refreshed two-column mock/live sheets in the journal build/j3-web/round2 folder. Screen-reader speech was not tested.
- Final cleanup audits: zero reserved staging WorkOS users, zero active reserved Convex profiles, zero related personal rows, zero photos and zero pending WorkOS deletion. Twenty-four locked deletion markers follow the backend's one-hour token-retention contract; synthetic conversation history is retained by deleteAccount, not purged. No backend or auth/session source changed.

## PR 10 follow-up

- Read Astra round 2 and Codex inline comments. Fixing pending destination eviction on reversal, one-shot focus and a separate arrival announcer.
- Lead approved a backend firstUnreadSequence indexed query to replace the opening page walk, journey-owned modal coverage, and stable event anchors. Historical mentions explicitly declined as v1 design, with no follow-up or code change.
- Testbox task 15ba777956ad owns this round's Linux verification. Protected auth/session source remains unchanged.
- Indexed unread query and backend assertions committed as 52fc89d through all 20 normal hook lanes. The first cloud browser pass passed all three suites; a later final-source run exposed an announcer state-spread regression after factoring for the complexity gate. Fixed the helper to return only announcement ID/text, preserving the new navigation cursor. Final regression rerun required.
- The scoped review found bottom-pinned catch-up could roll back to an obsolete window after more than three pages arrived. Latest-window following now deliberately replaces that obsolete anchor; the e2e holds 306 deliveries to exercise it.
- Corrected-source J1 and J2 passed, and both outgoing-page reversals measured 0px, but the extended held-delivery case did not finish cleanly. Stopped that owned run, recovered its eight exact-stamp orphan profiles through the normal dev deleteAccount operation, and added bounded catch-up diagnostics plus public-session refreshes for long-lived API fixtures. No auth/session implementation changed. Focused catch-up reproduction and final suites remain required.
- Located a harness fault in the large delivery hold: it also held Convex Ping frames, while the SDK reconnects after 60 seconds without server activity. Held-response fixtures now pass Ping through and delay data only. Long-lived API clients refresh through the existing public token endpoint; cleanup errors preserve their actual messages. The focused reproduction and J1/J2 are running independently on the same owned testbox.
- Focused trace captured retained sequences 101–300 at scrollTop 3754 with height 7584 / viewport 672 after a large arrival. Root cause: a retained live-row update could commit together with loading=true for the next window, so the viewport skipped restoration and incorrectly stopped bottom following. Restoration now applies to displayed rows even while destination queries load; explicit Jump remains distinct. Rerunning the same focused reproduction and all web suites on this final app source.
- Same focused catch-up reproduction passed cleanly on the fixed source in 118.08s: displayed 301–513 after 306 held arrivals, scrollTop 7400 + viewport 672 = height 8072, cleanup succeeded. A preceding retry overlapped a diagnostic log; the final full J3 run uses a separate fresh log, after all debug jobs are drained.

## PR 10 follow-up final proof

- Final application source: J1 passed (4 tests, 1 optional mock capture skipped) in 105.86s; J2 passed in 102.29s; J3 passed without retries in 405.94s. Backend tests: 60 passed. All 14 changed paths matched the cloud snapshot before the final J3 run.
- Both held outgoing-page reversals preserved the exact anchor offset: older -5.359375px before/after, newer -5.109375px before/after (0px movement). Concurrent prepend checks each moved 0.375px. Focus remained on the chosen control after delayed Jump completion; modal coverage retained unread state until closing; DOM-only arrival and history-silence assertions passed.
- With 450 unread: 2 opening, maximum 3 and 3 final live range subscriptions. The single MAX_LIVE_HISTORY_PAGES=3 constant bounds three reusable 100-sequence slots. The 306-arrival catch-up reached the bottom. Own-only 305-post history used exactly pages 201–300 and 301–400, with 2 live subscriptions and no divider or forward walk. Development registration events repeated those same ranges; the test now measures distinct arguments and active subscriptions rather than treating registration count as page count.
- Accepted Codex threads replied with fixing commits 52fc89d and 0e84478; historical mention labels declined with the exact v1 design text and no code/follow-up. Protected auth/session source is unchanged. Normal hooks passed all 20 lanes for implementation and test commits; no bypass.
- Independent cleanup audits found and recovered one Dina Journey fixture from an interrupted attempt via standard dev profiles.deleteAccount. Final audits: 0 reserved staging WorkOS users from this task, 0 active reserved profiles, 0 personal related rows/photos and 0 pending WorkOS deletions. 83 locked deletion markers were within their one-hour token-retention period; synthetic conversations remain under the deletion contract. An older unrelated J2 profile predates this task and was not changed. Owned Vite/browser processes stopped.
- Refreshed and inspected two-column mock/live sheets plus prior/current comparison under journal build/j3-web/round3, also published in round2/follow-up. Screen-reader speech and separate live attachment-announcement fixtures were not tested; attachment bytes remain unfetched. Event rows are included in the shared anchor mechanism, but the measured held-reversal anchors were posts.
