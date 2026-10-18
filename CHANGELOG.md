# Changelog

## [Unreleased]

### Added

- **Project scaffold**: Generated `q9chat` with its selected backend, shared UI, and quality tooling.
- **Headless sign-in endpoints and web sessions**: Sign in through email codes, Google or Apple with shared web and phone auth endpoints and a cookie-backed web session.

### Fixed

- **Local development**: Keep generated build output and local server logs out of git.
- **Harden sign-in redirects and session lifecycle**: Keep OAuth callbacks on-site, prevent one-time-code replays and late sign-in after sign-out, synchronize open tabs, and budget email authentication requests.
