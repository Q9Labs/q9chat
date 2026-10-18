import { firstName, initials } from "@q9chat/domain";

import type { Avatar, GroupRow, Notify } from "../types";

// What `groups.list` returns, as far as the list needs it. The Convex result is assignable to it.
type LiveAvatar = { color: string; lightColor: string; initials: string; photo: string | null };
type LivePerson = { name: string; isYou: boolean };
type LiveBase = { groupId: string; kind: "group" | "pair"; title: string; avatar: LiveAvatar };
export type LiveRow =
  | (LiveBase & {
      status: "member";
      lastActivityAt: number;
      preview: { by: LivePerson | null; summary: string };
      unreadCount: number;
      needsYou: boolean;
      notify: Notify;
    })
  | (LiveBase & { status: "removed"; removedBy: LivePerson; removedAt: number });

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;
const DAY_MS = 86_400_000;

const pad = (value: number) => String(value).padStart(2, "0");
/** Whole calendar days since the epoch, on the phone's own clock. */
const dayNumber = (date: Date) =>
  Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY_MS);

/** The list-row stamp: the time today, otherwise "Yesterday", a weekday within the week, or "30 Sep". */
export function rowStamp(at: number, now: Date): string {
  const date = new Date(at);
  const days = dayNumber(now) - dayNumber(date);
  if (days <= 0) return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  if (days === 1) return "Yesterday";
  if (days < 7) return WEEKDAYS[date.getDay()] ?? "";
  return `${date.getDate()} ${MONTHS[date.getMonth()] ?? ""}`;
}

/** How long until the phone's next local midnight, when "Yesterday" and the weekday labels move on. */
export const msUntilMidnight = (now: Date) =>
  new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() - now.getTime();

/** The URL of a protected photo on the Convex HTTP origin; the Avatar sends the access token with it. */
export const photoUrlOf = (siteUrl: string, path: string | null) =>
  path ? `${siteUrl}${path}` : null;

/** The signed-in person's avatar from `profiles.me`. */
export const profileAvatar = (
  profile: { displayName: string; photo: string | null; color: string; lightColor: string },
  siteUrl: string,
): Avatar => ({
  kind: "person",
  initials: initials(profile.displayName),
  color: profile.color,
  colorOnDark: profile.lightColor,
  photoUrl: photoUrlOf(siteUrl, profile.photo),
});

const avatarOf = (row: LiveRow, siteUrl: string): Avatar =>
  row.kind === "group"
    ? { kind: "group", initials: row.avatar.initials }
    : {
        kind: "person",
        initials: row.avatar.initials,
        color: row.avatar.color,
        colorOnDark: row.avatar.lightColor,
        photoUrl: photoUrlOf(siteUrl, row.avatar.photo),
      };

/** A pair with no message yet shows the same start line as the web list. */
function previewOf(row: Extract<LiveRow, { status: "member" }>) {
  if (row.kind === "pair" && row.preview.summary === "")
    return { by: null, summary: `This is the start of your group with ${firstName(row.title)}` };
  const { by, summary } = row.preview;
  return { by: by && { name: by.name, isYou: by.isYou }, summary };
}

/** `groups.list` results as the list screen's rows, newest activity first as the server sends them. */
export function groupRows(list: readonly LiveRow[], siteUrl: string, now: Date): GroupRow[] {
  return list.map((row): GroupRow => {
    const base = { groupId: row.groupId, title: row.title, avatar: avatarOf(row, siteUrl) };
    if (row.status === "removed")
      return {
        ...base,
        status: "removed",
        removedBy: row.removedBy.name,
        whenLabel: rowStamp(row.removedAt, now),
      };
    return {
      ...base,
      status: "member",
      whenLabel: rowStamp(row.lastActivityAt, now),
      preview: previewOf(row),
      unreadCount: row.unreadCount,
      needsYou: row.needsYou,
      notify: row.notify,
    };
  });
}
