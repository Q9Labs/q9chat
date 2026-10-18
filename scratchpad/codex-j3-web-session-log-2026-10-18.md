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
