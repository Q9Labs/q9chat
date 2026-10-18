import type { Author, MemberEvent, Preview } from "./types.js";

/** The reader's "now" and zone. The gallery fixes both so shots are repeatable. */
export interface Clock {
  readonly now: number;
  readonly timeZone?: string;
}

const MS_PER_DAY = 86_400_000;
const RUN_WINDOW_MS = 5 * 60_000;

/** Messages by one person closer together than this form one run. */
export { RUN_WINDOW_MS };

function parts(ms: number, timeZone: string | undefined, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("en-GB", { timeZone, ...options });
}

/** "10:01", 24-hour. */
export function clockTime(ms: number, timeZone?: string): string {
  return parts(ms, timeZone, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(ms);
}

/** Whole days since the epoch for the calendar day `ms` falls on in `timeZone`. */
export function dayNumber(ms: number, timeZone?: string): number {
  const fields = parts(ms, timeZone, {
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(ms);
  const pick = (type: string) => Number(fields.find((part) => part.type === type)?.value);
  return Math.floor(Date.UTC(pick("year"), pick("month") - 1, pick("day")) / MS_PER_DAY);
}

function ago(ms: number, clock: Clock): number {
  return dayNumber(clock.now, clock.timeZone) - dayNumber(ms, clock.timeZone);
}

function weekday(ms: number, clock: Clock, style: "short" | "long"): string {
  return parts(ms, clock.timeZone, { weekday: style }).format(ms);
}

/** The list-row stamp: the time today, otherwise "Yesterday", "Thu" or "30 Sep". */
export function rowStamp(ms: number, clock: Clock): string {
  const days = ago(ms, clock);
  if (days <= 0) return clockTime(ms, clock.timeZone);
  if (days === 1) return "Yesterday";
  if (days < 7) return weekday(ms, clock, "short");
  return parts(ms, clock.timeZone, { day: "numeric", month: "short" }).format(ms);
}

/** The date separator in a timeline. */
export function dayLabel(ms: number, clock: Clock): string {
  const days = ago(ms, clock);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return weekday(ms, clock, "long");
  return parts(ms, clock.timeZone, { day: "numeric", month: "long" }).format(ms);
}

/** The search-result stamp: the time today, otherwise the same words as a row. */
export const resultStamp = rowStamp;

/** "0:24" from milliseconds. */
export function durationLabel(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** "84 KB · PDF" from a byte count and a file name. */
export function fileMeta(bytes: number, name: string): string {
  const size =
    bytes >= 1_000_000
      ? `${(bytes / 1_048_576).toFixed(1)} MB`
      : `${Math.max(1, Math.round(bytes / 1024))} KB`;
  const dot = name.lastIndexOf(".");
  const kind = dot > 0 ? name.slice(dot + 1).toUpperCase() : "File";
  return `${size} · ${kind}`;
}

export function joinNames(names: readonly string[]): string {
  if (names.length < 2) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

export function authorLabel(author: Author): string {
  return author.isYou ? "You" : author.name;
}

/** "Shoaib removed Omar" as plain text, for previews and quotes. */
export function eventText(event: MemberEvent): string {
  const people = "people" in event ? joinNames(event.people.map(authorLabel)) : "";
  switch (event.type) {
    case "created":
      return `${authorLabel(event.by)} created this group`;
    case "added":
      return `${authorLabel(event.by)} added ${people}`;
    case "removed":
      return `${authorLabel(event.by)} removed ${people}`;
    case "joined":
      return `${people} joined`;
    case "left":
      return `${people} left`;
    case "start":
      return `This is the start of your group with ${people}`;
  }
}

/** The group-row preview line: "You: ...", "Sara: ..." or the bare summary in a pair or event. */
export function previewLine(preview: Preview, kind: "group" | "pair"): string {
  if (preview.by === "you") return `You: ${preview.summary}`;
  if (preview.by === null || kind === "pair") return preview.summary;
  return `${preview.by}: ${preview.summary}`;
}

/** Names over 28 characters shorten to 27 plus an ellipsis in the composer placeholder. */
export function shortTitle(title: string): string {
  return title.length > 28 ? `${title.slice(0, 27)}…` : title;
}

/** Splits text around matches of `query`, case-insensitively, for highlighting. */
export function splitMatches(
  text: string,
  query: string,
): readonly { readonly text: string; readonly match: boolean }[] {
  const needle = query.trim().toLowerCase();
  if (needle === "") return [{ text, match: false }];
  const out: { text: string; match: boolean }[] = [];
  const lower = text.toLowerCase();
  let at = 0;
  for (let hit = lower.indexOf(needle); hit !== -1; hit = lower.indexOf(needle, at)) {
    if (hit > at) out.push({ text: text.slice(at, hit), match: false });
    out.push({ text: text.slice(hit, hit + needle.length), match: true });
    at = hit + needle.length;
  }
  if (at < text.length) out.push({ text: text.slice(at), match: false });
  return out;
}
