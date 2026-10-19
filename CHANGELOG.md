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
- **Read live groups on your phone**: Open a group at its first unread message, read live posts, browse older history and see who is typing on iOS and Android. Your read state stays private.
- **Send photos, files and voice notes on the web**: Send attachments without losing a text draft. Keep unsent bytes on this device for retry, and open, download or play protected attachments.
- **Web message actions**: Reply with a quote, jump to the original, edit or delete your messages, react and report messages on the web. Delete your account from Account, then return to sign-in.
- **Find old messages on the web**: Search your groups as you type, then open a result at its highlighted message.
- **Manage group membership and mute on web**: Mute or unmute a group, leave with confirmation, remove a member, and clear a removal notice.
- **Production phone build settings**: Store builds connect to the same Q9 Chat service as the web app. Development builds keep their local settings.
- **Desktop notifications for mentions and replies**: Turn on desktop notifications after opening a group, choose which groups can interrupt, and open a notification at its message.
- **Search and manage groups on phone**: Search your groups and open a matching message. Mute a group, leave it, or remove a member with confirmation.
- **Send text from your phone**: Send text on iOS and Android, retry failed messages after a restart, keep a draft in each group and see who is typing.
- **Send attachments from your phone**: Share photos, files and voice notes with upload retry and protected playback. Sign out returns to sign-in even when session cleanup fails.
- **Use chat in a narrow browser**: Groups, conversations and Group info now use one full-width pane below 720 pixels. Back returns to Groups, and message and recording controls stay within reach.
- **Phone message actions and account deletion**: Reply with a quote, edit or delete your messages, react, report a message and delete your account from the phone app.

### Fixed

- **Local development**: Keep generated build output and local server logs out of git.
- **Harden sign-in redirects and session lifecycle**: Keep OAuth callbacks on-site, prevent one-time-code replays and late sign-in after sign-out, synchronize open tabs, and budget email authentication requests.
- **Keep sign-in recovery and profile setup consistent**: Keep avatar colours consistent, recover failed sign-out, reconcile setup across tabs, and explain unsupported or oversized profile photos.
- **Clear phone drafts when signing out**: Signing out forgets local drafts and unsent text. Losing group access clears that group’s local text, and leaving the composer stops typing.
- **Erase private phone media when access ends**: Leaving or removal erases downloaded group media. Expired sessions erase local chat data before sign-in.
- **Keep unsent messages during offline phone restarts**: Temporary sign-in connection errors preserve drafts and unsent attachments until Retry can restore the session.
