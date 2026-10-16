import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// Chat model. Membership is the whole permission model: every query and
// mutation on a group first resolves the caller's membership row.

export const profileValidator = v.union(
  v.object({
    status: v.literal("active"),
    authUserId: v.string(),
    displayName: v.string(),
    // Lowercased for exact lookup when adding someone by email.
    email: v.string(),
    photoStorageId: v.optional(v.id("_storage")),
  }),
  // Account deletion keeps a tombstone so old messages still have an author.
  v.object({
    status: v.literal("deleted"),
    authUserId: v.string(),
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
    lastSequence: v.number(),
    lastMessageAt: v.number(),
  }),
  // A conversation between two people. pairKey is the two profile ids in
  // sorted order, so starting it again finds the existing group.
  v.object({
    kind: v.literal("pair"),
    pairKey: v.string(),
    lastSequence: v.number(),
    lastMessageAt: v.number(),
  }),
);

const groups = defineTable(groupValidator).index("by_pair_key", ["pairKey"]);

export const notifyModeValidator = v.union(
  v.literal("mentions"),
  v.literal("all"),
  v.literal("muted"),
);

// Leaving a group deletes the row, which ends access.
const memberships = defineTable({
  groupId: v.id("groups"),
  profileId: v.id("profiles"),
  notify: notifyModeValidator,
  joinedAt: v.number(),
})
  .index("by_group_profile", ["groupId", "profileId"])
  .index("by_profile", ["profileId"]);

// Kept apart from memberships so marking a group read does not re-run every
// query that checks membership.
const readStates = defineTable({
  groupId: v.id("groups"),
  profileId: v.id("profiles"),
  lastReadSequence: v.number(),
}).index("by_group_profile", ["groupId", "profileId"]);

export const attachmentValidator = v.union(
  v.object({
    kind: v.literal("image"),
    storageId: v.id("_storage"),
    contentType: v.string(),
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
    durationMs: v.number(),
  }),
);

const messages = defineTable({
  groupId: v.id("groups"),
  authorId: v.id("profiles"),
  sequence: v.number(),
  // Chosen by the sending client; a retry with the same key returns the
  // existing message instead of creating a second one.
  clientKey: v.string(),
  body: v.string(),
  replyToId: v.optional(v.id("messages")),
  mentions: v.array(v.id("profiles")),
  attachments: v.array(attachmentValidator),
})
  .index("by_group_sequence", ["groupId", "sequence"])
  .index("by_author_client_key", ["authorId", "clientKey"])
  .searchIndex("search_body", { searchField: "body", filterFields: ["groupId"] });

const inviteLinks = defineTable({
  groupId: v.id("groups"),
  token: v.string(),
  createdBy: v.id("profiles"),
  revokedAt: v.optional(v.number()),
})
  .index("by_token", ["token"])
  .index("by_group", ["groupId"]);

// Expo's push service delivers to APNs and FCM; browsers use Web Push.
export const deviceValidator = v.union(
  v.object({
    kind: v.literal("expo"),
    profileId: v.id("profiles"),
    expoPushToken: v.string(),
  }),
  v.object({
    kind: v.literal("web"),
    profileId: v.id("profiles"),
    endpoint: v.string(),
    p256dh: v.string(),
    auth: v.string(),
  }),
);

const devices = defineTable(deviceValidator)
  .index("by_profile", ["profileId"])
  .index("by_expo_push_token", ["expoPushToken"])
  .index("by_endpoint", ["endpoint"]);

const reports = defineTable({
  messageId: v.id("messages"),
  reporterId: v.id("profiles"),
  reason: v.string(),
}).index("by_message", ["messageId"]);

export default defineSchema({
  devices,
  groups,
  inviteLinks,
  memberships,
  messages,
  profiles,
  readStates,
  reports,
});
