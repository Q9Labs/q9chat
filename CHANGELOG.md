# Changelog

## [Unreleased]

### Added

- **Create and join groups on the web**: Find people by name or exact email, create groups or pairs, add members, and share or join invite links. Group info keeps member email addresses private.

- **Project scaffold**: Generated `q9chat` with its selected backend, shared UI, and quality tooling.
- **Headless sign-in endpoints and web sessions**: Sign in through email codes, Google or Apple with shared web and phone auth endpoints and a cookie-backed web session.
- **Sign in and find your groups on the web**: Sign in by email code, set up a profile, see live group previews and unread counts, and manage your account and sign out. Google and Apple start the shared sign-in flow.

### Fixed

- **Local development**: Keep generated build output and local server logs out of git.
- **Harden sign-in redirects and session lifecycle**: Keep OAuth callbacks on-site, prevent one-time-code replays and late sign-in after sign-out, synchronize open tabs, and budget email authentication requests.
- **Keep sign-in recovery and profile setup consistent**: Keep avatar colours consistent, recover failed sign-out, reconcile setup across tabs, and explain unsupported or oversized profile photos.
