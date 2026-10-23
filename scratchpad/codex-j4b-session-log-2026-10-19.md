# J4 web attachments

- Read the lead brief and all W01–W24 requirements. Branch `feat/j4-web-attachments` starts at `origin/main` after PR 13.
- Implementing a separate IndexedDB media outbox, account/group-scoped retained blobs, real MediaRecorder capture and authenticated display bytes. Text drafts remain separate.
- Lead requires M4 only, including parallel e2e files. M4 reachable, 16 GiB free. Its Homebrew Node 24 cannot start (missing simdjson dylib); preparing a task-local official Node 24.
- Initial web typecheck could not resolve the unbuilt workspace Convex package. This is setup failure, not feature proof. All remaining heavy checks will run on the M4.
- Fixed a real StrictMode lifetime bug after a browser reproduction: each effect setup now owns its own upload abort controller.
- Main attachment suite passes on M4 Chromium 156: peer image/file byte checks, Unicode filename download, upload retry/reload, lost response, real MediaRecorder and HTMLAudioElement playback. Synthetic oscillator input is not physical microphone proof.
- Recovery suite passes after waiting for history readiness before forcing offline: persistent browser restart, retained bytes, partial multi-upload atomicity, two-tab dedup, quota error, exact 20 MB and denied/missing microphone recovery.
- Shared M4 port 3000 collided with another lane. Task now uses loopback 3104 and an explicitly configured development CORS origin. Never used Testbox.
- Refactored quality hotspots without changing limits. Lint and React Doctor pass; semgrep and generated-code drift pass. Remaining history cognitive threshold fixed locally, pending final isolated check.
- Reproduced MediaRecorder.start failure leaving its interval alive, then verified the fix with actual track-ended and no-recording-bar assertions.
- Final attachment/format/capture runs pass. Restart rerun now waits for the blob URL before reading private download bytes; the retained bytes, quota, partial retry and two-tab checks pass.
- Final commit bb7bc1a35f939a6dbec4a819978ac9f1aebe9c92 pushed as PR #16. Real M4 precommit passed. Full gate ran once: 19 lanes passed, Semgrep hit its default per-rule timeout. Isolated full-scope Semgrep rerun passed with a task-local 30-second budget; no rules or findings disabled. Both logs retained.
- GitHub CI passed. PR body and published page checks pass, with public contact-sheet attachments and a reviewed 70-second local-Kokoro walkthrough. Temporary development WEB_TEST_ORIGIN removed and preview stopped. Codex GitHub review still running; task-owned M4 copy retained until its findings are handled, then delete it.
- Handoff: no existing inline Codex threads; review still running. T3 explicitly rejected subagent PR watching and says the parent owns it. PR remains linked, not watched. Final evidence copied; task M4 checkout/local Node/preview supervisor deleted, zero task processes remained; temporary dev origin removed; task-created Helium tab closed. Parent must monitor the pending Codex review.
