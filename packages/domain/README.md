# @q9chat/domain

Pure, dependency-free chat presentation helpers shared by Convex and the apps.
Import from `@q9chat/domain`; source TypeScript is the workspace export.

- `avatarColors(id)` returns `color` and its dark-mode `lightColor`.
- `avatarColor(id, dark?)`, `initials(name)` and `firstName(name)` identify people.
- `parseMentions(body, members)` returns matching member ids (all same-first-name matches).
- `eventSentence(event)` and `listPreview(preview, pair?)` apply the viewer's `isYou`.
- `messageSummary(message)` returns text, attachment labels or the deleted placeholder.
- `timeLabel(timestamp, now?, locale?)`, `fileSize(bytes)` and `duration(milliseconds)` format labels.
- `reactionEmoji`, `reportReasons` and `ConvexErrorCode` define shared choices and errors.

Pass `now` when rendering time labels deterministically or in tests. Time labels
use the caller's local timezone; stored timestamps are epoch milliseconds.
