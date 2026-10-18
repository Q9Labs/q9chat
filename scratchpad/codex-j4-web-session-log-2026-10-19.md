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
