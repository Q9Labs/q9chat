import type { api } from "@q9chat/convex";
import { messageSummary, timeLabel } from "@q9chat/domain";
import type { FunctionReturnType } from "convex/server";

import type { Message, Segment, TimelineItem } from "../types.ts";
import { eventSegments } from "./groupEvents.ts";
import { livePerson } from "./livePeople.ts";

export type HistoryGroup = Extract<
  NonNullable<FunctionReturnType<typeof api.groups.get>>,
  { status: "member" }
>;
export type HistoryRow = FunctionReturnType<typeof api.messages.range>[number];
export const PAGE_SIZE = 100;
export const pageOf = (sequence: number) => Math.floor(Math.max(0, sequence - 1) / PAGE_SIZE);
export function slideWindow(first: number, last: number, direction: "older" | "newer") {
  return direction === "older"
    ? { first: Math.max(0, first - 1), last: Math.min(last, Math.max(0, first - 1) + 2) }
    : { first: Math.max(first, last - 1), last: last + 1 };
}

export function historyItem(
  row: HistoryRow,
  siteUrl: string,
  context: {
    members: HistoryGroup["members"];
    previous: HistoryRow | undefined;
    unread: number | null;
  },
): TimelineItem {
  if (row.kind === "event")
    return { type: "system", id: row.id, segments: eventSegments(row.event) };
  const summary = messageSummary(row);
  const segments = postSegments(row, context.members);
  const message: Message = {
    id: row.id,
    timeLabel: timeLabel(row.createdAt, row.createdAt),
    mine: row.author.isYou,
    state: "sent",
    content: postContent(row, segments, siteUrl),
    quote: postQuote(row),
    reactions:
      row.kind === "post" ? row.reactions.map((reaction) => ({ ...reaction, who: "" })) : [],
    summary: `${row.author.name}: ${summary}`,
    copyText: row.kind === "post" && row.body ? row.body : null,
  };
  return {
    type: "group",
    id: row.id,
    author: livePerson(row.author, siteUrl),
    timeLabel: message.timeLabel,
    messages: [message],
    continuation: sameRun(
      context.previous && context.previous.kind !== "event"
        ? { authorId: context.previous.author.id, createdAt: context.previous.createdAt }
        : null,
      { authorId: row.author.id, createdAt: row.createdAt },
      row.sequence === context.unread,
    ),
  };
}

function postContent(
  row: Exclude<HistoryRow, { kind: "event" }>,
  segments: Segment[],
  siteUrl: string,
): Message["content"] {
  if (row.kind === "deleted") return { kind: "deleted" };
  if (!row.attachments.length) return { kind: "text", segments, edited: row.editedAt !== null };
  return {
    kind: "attachments",
    caption: segments,
    files: row.attachments.map((file) => ({ ...file, url: `${siteUrl}${file.url}` })),
  };
}

function postQuote(row: Exclude<HistoryRow, { kind: "event" }>): Message["quote"] {
  if (row.kind !== "post" || !row.replyTo) return null;
  return {
    messageId: row.replyTo.id,
    author: row.replyTo.author.name,
    summary: "deleted" in row.replyTo ? "Message deleted" : row.replyTo.summary,
  };
}

function postSegments(
  row: Exclude<HistoryRow, { kind: "event" }>,
  members: HistoryGroup["members"],
) {
  const mentions = new Set(row.kind === "post" ? row.mentions : []);

  return messageSegments(
    row.kind === "post" ? row.body : "",
    members.filter((member) => mentions.has(member.id)).map((member) => member.name),
  );
}

export function messageBounds(row: { y: number }, content: { y: number; height: number }) {
  return { y: row.y + content.y, height: content.height };
}

export function visibleSequence(
  rows: readonly { id: string; sequence: number; kind?: string }[],
  layouts: ReadonlyMap<string, { y: number; height: number }>,
  offset: number,
  height: number,
) {
  return rows.reduce((last, row) => {
    const box = layouts.get(row.id);
    return row.kind !== "event" &&
      box &&
      height > 0 &&
      box.y < offset + height &&
      box.y + box.height > offset
      ? Math.max(last, row.sequence)
      : last;
  }, 0);
}

export function sameRun(
  previous: { authorId: string; createdAt: number } | null,
  next: { authorId: string; createdAt: number },
  boundary: boolean,
) {
  return (
    !boundary &&
    previous !== null &&
    previous.authorId === next.authorId &&
    next.createdAt - previous.createdAt < 300_000 &&
    new Date(previous.createdAt).toDateString() === new Date(next.createdAt).toDateString()
  );
}

export function messageSegments(text: string, mentions: readonly string[]): Segment[] {
  const names = new Set(mentions.map((name) => name.toLocaleLowerCase()));
  return text
    .split(/(https?:\/\/[^\s]+|@[\p{L}\p{N}_]+)/gu)
    .filter(Boolean)
    .map((part) => ({
      type: /^https?:\/\//u.test(part)
        ? "link"
        : part.startsWith("@") && names.has(part.slice(1).toLocaleLowerCase())
          ? "mention"
          : "text",
      text: part,
    }));
}

const day = (value: Date) => Date.UTC(value.getFullYear(), value.getMonth(), value.getDate());
export function historyDay(at: number, now: Date) {
  const date = new Date(at);
  const days = (day(now) - day(date)) / 86_400_000;
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "long" });
}

export function typingLabel(names: readonly string[]) {
  if (names.length === 0) return null;
  if (names.length === 1) return `${names[0]} is typing…`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing…`;
  return `${names.length} people are typing…`;
}

export function openingOffset(
  unread: number | null,
  rows: readonly { id: string; sequence: number }[],
  layouts: ReadonlyMap<string, { y: number }>,
  bottom: number,
) {
  if (unread === null || rows.length === 0) return bottom;
  const first = rows.find((row) => row.sequence === unread);
  const box = first ? layouts.get(first.id) : null;
  return box ? Math.max(0, box.y - 12) : null;
}

export function followAfterScroll(following: boolean, from: number, to: number, atBottom: boolean) {
  if (atBottom) return true;
  return to < from - 2 ? false : following;
}
