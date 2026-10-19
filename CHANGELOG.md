# Changelog

## [Unreleased]

### Added

- **Create and join groups on the web**: Find people by name or exact email, create groups or pairs, add members, and share or join invite links. Group info keeps member email addresses private.
- **Project scaffold**: Generated `q9chat` with its selected backend, shared UI, and quality tooling.
- **Headless sign-in endpoints and web sessions**: Sign in through email codes, Google or Apple with shared web and phone auth endpoints and a cookie-backed web session.
- **Sign in and find your groups on the web**: Sign in by email code, set up a profile, see live group previews and unread counts, and manage your account and sign out. Google and Apple start the shared sign-in flow.
- **Sign in and find your groups on the phone**: Sign in by email code, Google or Apple, set up a profile with an optional photo, see live group previews and unread counts, manage your account and sign out. A saved sign-in survives a lost connection and shows a retry. Signing out takes effect on the phone at once, even offline, and says so if it fails.
- **Web conversation history and unread position**: Open a group at its unread divider, load older history, follow live messages and see expiring typing indicators.
- **Groups on the phone**: On the phone you can create a group or a pair, add people from Group info, copy the invite link, and join a group by opening its link, including when you were signed out. A group you were removed from can be taken off your list.
- **Send text on the web**: Messages appear immediately, failed sends can be retried without duplicates, and each group keeps its own draft across reloads.
- **Find old messages on the web**: Search your groups as you type, then open a result at its highlighted message.

### Fixed

- **Local development**: Keep generated build output and local server logs out of git.
- **Harden sign-in redirects and session lifecycle**: Keep OAuth callbacks on-site, prevent one-time-code replays and late sign-in after sign-out, synchronize open tabs, and budget email authentication requests.
- **Keep sign-in recovery and profile setup consistent**: Keep avatar colours consistent, recover failed sign-out, reconcile setup across tabs, and explain unsupported or oversized profile photos.
