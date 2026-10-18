import { v } from "convex/values";

import { notifyModeValidator, reactionEmojiValidator } from "../schema";
export const avatar = v.object({
  color: v.string(),
  lightColor: v.string(),
  initials: v.string(),
  photo: v.union(v.string(), v.null()),
});
export const person = v.object({
  id: v.id("profiles"),
  name: v.string(),
  fullName: v.string(),
  isYou: v.boolean(),
  deleted: v.boolean(),
  avatar,
});
export const preview = v.object({ by: v.union(person, v.null()), summary: v.string() });
export const groupKind = v.union(v.literal("group"), v.literal("pair"));
export const removed = { title: v.string(), avatar, removedBy: person, removedAt: v.number() };
export const event = v.union(
  v.object({ type: v.literal("created"), by: person }),
  v.object({ type: v.literal("added"), by: person, people: v.array(person) }),
  v.object({ type: v.literal("joined"), person }),
  v.object({ type: v.literal("left"), person }),
  v.object({ type: v.literal("removed"), by: person, person }),
);
const fileBase = { url: v.string(), contentType: v.string(), size: v.number() };
export const attachment = v.union(
  v.object({ ...fileBase, kind: v.literal("image"), width: v.number(), height: v.number() }),
  v.object({ ...fileBase, kind: v.literal("file"), name: v.string() }),
  v.object({
    ...fileBase,
    kind: v.literal("voice"),
    durationMs: v.number(),
    waveform: v.array(v.number()),
  }),
);
export const uploadAttachment = v.union(
  v.object({
    kind: v.literal("image"),
    uploadId: v.id("uploads"),
    width: v.number(),
    height: v.number(),
  }),
  v.object({ kind: v.literal("file"), uploadId: v.id("uploads"), name: v.string() }),
  v.object({
    kind: v.literal("voice"),
    uploadId: v.id("uploads"),
    durationMs: v.number(),
    waveform: v.array(v.number()),
  }),
);
const base = { id: v.id("messages"), sequence: v.number(), createdAt: v.number() };
export const message = v.union(
  v.object({ ...base, kind: v.literal("deleted"), author: person }),
  v.object({ ...base, kind: v.literal("event"), event }),
  v.object({
    ...base,
    kind: v.literal("post"),
    clientKey: v.string(),
    author: person,
    body: v.string(),
    mentions: v.array(person),
    attachments: v.array(attachment),
    replyTo: v.union(
      v.null(),
      v.object({
        id: v.id("messages"),
        sequence: v.number(),
        author: person,
        deleted: v.literal(true),
      }),
      v.object({ id: v.id("messages"), sequence: v.number(), author: person, summary: v.string() }),
    ),
    reactions: v.array(
      v.object({
        emoji: reactionEmojiValidator,
        count: v.number(),
        mine: v.boolean(),
      }),
    ),
    editedAt: v.union(v.number(), v.null()),
  }),
);
export const groupRow = v.union(
  v.object({
    status: v.literal("member"),
    groupId: v.id("groups"),
    kind: groupKind,
    title: v.string(),
    avatar,
    lastActivityAt: v.number(),
    preview,
    unreadCount: v.number(),
    needsYou: v.boolean(),
    notify: notifyModeValidator,
  }),
  v.object({ status: v.literal("removed"), groupId: v.id("groups"), kind: groupKind, ...removed }),
);

export const searchHit = v.object({
  groupId: v.id("groups"),
  groupTitle: v.string(),
  sequence: v.number(),
  author: person,
  createdAt: v.number(),
  snippet: v.string(),
});
