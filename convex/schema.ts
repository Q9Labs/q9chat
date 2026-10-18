import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// Chat model. Membership is the whole permission model: every query and
// mutation on a group first resolves the caller's membership row, and a row
// exists only while the person can read and write the group.

export const profileValidator = v.union(
  v.object({
    status: v.literal("active"),
    authUserId: v.string(),
    displayName: v.string(),
    // Lowercased for exact lookup when adding someone by email.
    email: v.string(),
    photoStorageId: v.optional(v.id("_storage")),
  }),
  // Deletion locks the account at once; a cron drives the deletion steps
  // until done. authUserId stays until every access token issued before the
  // sign-in account was deleted has expired, so an old token can't set up a
  // new profile.
  v.object({
    status: v.literal("deleting"),
    authUserId: v.string(),
    requestedAt: v.number(),
    lastStepAt: v.optional(v.number()),
    photoStorageId: v.optional(v.id("_storage")),
    signInAccountDeletedAt: v.optional(v.number()),
  }),
  // The tombstone keeps old messages attributed, shown as "Deleted account".
  // It holds no personal data and no link to the sign-in account.
  v.object({
    status: v.literal("deleted"),
    deletedAt: v.number(),
  }),
);

const profiles = defineTable(profileValidator)
  .index("by_auth_user", ["authUserId"])
  .index("by_email", ["email"]);

export const groupValidator = v.union(
  v.object({
    kind: v.literal("group"),
    name: v.string(),
    createdBy: v.id("profiles"),
    // Anyone holding the link can join and read the whole group, except a
    // person who was removed: only a member can bring them back.
    inviteToken: v.string(),
    lastSequence: v.number(),
  }),
  // A conversation between two people. pairKey is the two profile ids in
  // sorted order, so starting it again finds the existing group. A pair has
  // no invite link and nobody else joins it.
  v.object({
    kind: v.literal("pair"),
    pairKey: v.string(),
    lastSequence: v.number(),
  }),
);

const groups = defineTable(groupValidator)
  .index("by_pair_key", ["pairKey"])
  .index("by_invite_token", ["inviteToken"]);

export const notifyModeValidator = v.union(
  v.literal("mentions"),
  v.literal("all"),
  v.literal("muted"),
);

// Leaving or being removed deletes the row, which ends access.
const memberships = defineTable({
  groupId: v.id("groups"),
  profileId: v.id("profiles"),
  notify: notifyModeValidator,
  joinedAt: v.number(),
})
  .index("by_group_profile", ["groupId", "profileId"])
  .index("by_profile", ["profileId"]);

// A person removed from a group. The group stays in their list as "Shoaib
// removed you" until they dismiss it, and the row keeps them from rejoining
// through the invite link until a member adds them back. It grants no access
// to the group's messages.
const removals = defineTable({
  groupId: v.id("groups"),
  profileId: v.id("profiles"),
  removedBy: v.id("profiles"),
  removedAt: v.number(),
  dismissedAt: v.optional(v.number()),
})
  .index("by_group_profile", ["groupId", "profileId"])
  .index("by_profile", ["profileId"]);

// Kept apart from memberships so marking a group read does not re-run every
// query that checks membership. lastNeedsYouSequence is the latest message
// that mentioned this person or replied to them when it was sent; it drives
// the "@" badge.
const readStates = defineTable({
  groupId: v.id("groups"),
  profileId: v.id("profiles"),
  lastReadSequence: v.number(),
  lastNeedsYouSequence: v.number(),
})
  .index("by_group_profile", ["groupId", "profileId"])
  .index("by_profile", ["profileId"]);

// One row per post a member hasn't read yet: other people's posts, including
// ones deleted since. Marking read deletes the rows up to the new position, so
// counting unread reads only unread rows, never the history between them.
const unreadPosts = defineTable({
  profileId: v.id("profiles"),
  groupId: v.id("groups"),
  sequence: v.number(),
}).index("by_profile_group_sequence", ["profileId", "groupId", "sequence"]);

// A file uploaded through the authenticated upload route and not yet used.
// Sending a post or setting a photo consumes it, so each upload is used once
// and only by its uploader. A cron deletes uploads left unused for a day.
const uploads = defineTable({
  ownerId: v.id("profiles"),
  storageId: v.id("_storage"),
  contentType: v.string(),
  size: v.number(),
}).index("by_owner", ["ownerId"]);

export const attachmentValidator = v.union(
  v.object({
    kind: v.literal("image"),
    storageId: v.id("_storage"),
    contentType: v.string(),
    size: v.number(),
    width: v.number(),
    height: v.number(),
  }),
  v.object({
    kind: v.literal("file"),
    storageId: v.id("_storage"),
    contentType: v.string(),
    name: v.string(),
    size: v.number(),
  }),
  v.object({
    kind: v.literal("voice"),
    storageId: v.id("_storage"),
    contentType: v.string(),
    size: v.number(),
    durationMs: v.number(),
    // Peak levels from 0 to 1, measured while recording, drawn as the waveform.
    waveform: v.array(v.number()),
  }),
);

export const reactionEmojiValidator = v.union(
  v.literal("👍"),
  v.literal("❤️"),
  v.literal("😂"),
  v.literal("😮"),
  v.literal("🙏"),
);

// The group's own history of who joined and left, shown as quiet lines.
export const memberEventValidator = v.union(
  v.object({ type: v.literal("created"), by: v.id("profiles") }),
  v.object({
    type: v.literal("added"),
    by: v.id("profiles"),
    profileIds: v.array(v.id("profiles")),
  }),
  v.object({ type: v.literal("joined"), profileId: v.id("profiles") }),
  v.object({ type: v.literal("removed"), by: v.id("profiles"), profileId: v.id("profiles") }),
  v.object({ type: v.literal("left"), profileId: v.id("profiles") }),
);

// sequence orders a group's history; it is gap-free, so it also counts unread
// messages and finds a message far back in the history.
export const messageValidator = v.union(
  v.object({
    kind: v.literal("post"),
    groupId: v.id("groups"),
    sequence: v.number(),
    authorId: v.id("profiles"),
    // Chosen by the sending client; a retry with the same key returns the
    // existing message instead of creating a second one.
    clientKey: v.string(),
    body: v.string(),
    // The body plus file names, which search also matches.
    searchText: v.string(),
    replyToId: v.optional(v.id("messages")),
    mentions: v.array(v.id("profiles")),
    attachments: v.array(attachmentValidator),
    editedAt: v.optional(v.number()),
  }),
  // Deleting a post drops its content and files but keeps its place, so
  // replies to it still make sense.
  v.object({
    kind: v.literal("deleted"),
    groupId: v.id("groups"),
    sequence: v.number(),
    authorId: v.id("profiles"),
    clientKey: v.string(),
    deletedAt: v.number(),
  }),
  v.object({
    kind: v.literal("event"),
    groupId: v.id("groups"),
    sequence: v.number(),
    event: memberEventValidator,
  }),
);

const messages = defineTable(messageValidator)
  .index("by_group_sequence", ["groupId", "sequence"])
  .index("by_author_client_key", ["authorId", "clientKey"])
  .searchIndex("search_text", { searchField: "searchText", filterFields: ["groupId"] });

// A person has at most one reaction on a post; a new one replaces it.
const reactions = defineTable({
  messageId: v.id("messages"),
  profileId: v.id("profiles"),
  emoji: reactionEmojiValidator,
})
  .index("by_message_profile", ["messageId", "profileId"])
  .index("by_profile", ["profileId"]);

// Who is typing right now: the only presence Q9 Chat shows. The apps hide a
// row once expiresAt passes, and a cron deletes expired rows.
const typing = defineTable({
  groupId: v.id("groups"),
  profileId: v.id("profiles"),
  expiresAt: v.number(),
})
  .index("by_group_profile", ["groupId", "profileId"])
  .index("by_profile", ["profileId"])
  .index("by_expiry", ["expiresAt"]);

// Expo's push service delivers to APNs and FCM; browsers use Web Push.
export const deviceValidator = v.union(
  v.object({
    kind: v.literal("expo"),
    profileId: v.id("profiles"),
    expoPushToken: v.string(),
  }),
  // A browser must show every push it receives, so it can't skip one for the
  // group on screen. Instead a focused tab reports the group it shows here,
  // privately, and delivery skips this device for that group until expiry.
  v.object({
    kind: v.literal("web"),
    profileId: v.id("profiles"),
    endpoint: v.string(),
    p256dh: v.string(),
    auth: v.string(),
    viewing: v.optional(v.object({ groupId: v.id("groups"), until: v.number() })),
  }),
);

const devices = defineTable(deviceValidator)
  .index("by_profile", ["profileId"])
  .index("by_expo_push_token", ["expoPushToken"])
  .index("by_endpoint", ["endpoint"]);

export const reportReasonValidator = v.union(
  v.literal("spam"),
  v.literal("harassment"),
  v.literal("other"),
);

// The author is never told who reported their message. The excerpt keeps
// the reported text for review even if the author deletes the message.
const reports = defineTable({
  messageId: v.id("messages"),
  reporterId: v.id("profiles"),
  reason: reportReasonValidator,
  excerpt: v.string(),
})
  .index("by_message_reporter", ["messageId", "reporterId"])
  .index("by_reporter", ["reporterId"]);

export default defineSchema({
  devices,
  groups,
  memberships,
  messages,
  profiles,
  reactions,
  readStates,
  removals,
  reports,
  typing,
  unreadPosts,
  uploads,
});
