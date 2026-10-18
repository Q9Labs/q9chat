export const reactionEmoji = ["👍", "❤️", "😂", "😮", "🙏"] as const;
export const reportReasons = ["spam", "harassment", "other"] as const;
export type ErrorCode =
  | "not_member"
  | "not_author"
  | "removed_from_group"
  | "invite_invalid"
  | "name_required"
  | "name_too_long"
  | "group_full"
  | "too_many_groups"
  | "pair_locked"
  | "account_unavailable"
  | "client_key_reused"
  | "message_too_long"
  | "bad_attachment";
export type ConvexErrorCode = ErrorCode;
const colors = [
  "#0369a1",
  "#be185d",
  "#b45309",
  "#0f766e",
  "#6d28d9",
  "#c2410c",
  "#4d7c0f",
  "#b91c1c",
] as const;
const lightColors = [
  "#38bdf8",
  "#f472b6",
  "#fbbf24",
  "#2dd4bf",
  "#a78bfa",
  "#fb923c",
  "#a3e635",
  "#f87171",
] as const;
export function avatarColors(id: string) {
  let hash = 0;
  for (const char of id) hash = (Math.imul(hash, 31) + char.charCodeAt(0)) | 0;
  const index = (hash >>> 0) % colors.length;
  return { color: colors[index] ?? colors[0], lightColor: lightColors[index] ?? lightColors[0] };
}
export function avatarColor(id: string, dark = false) {
  const value = avatarColors(id);
  return dark ? value.lightColor : value.color;
}
export function firstName(name: string) {
  return name.trim().split(/\s+/u)[0] ?? "";
}
export function initials(name: string) {
  return name
    .trim()
    .split(/\s+/u)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
}
export function parseMentions(body: string, members: readonly { id: string; name: string }[]) {
  const names = new Set(
    Array.from(body.matchAll(/(?:^|[^\p{L}\p{N}_])@([\p{L}\p{N}_]+)/gu), (match) =>
      (match[1] ?? "").toLocaleLowerCase(),
    ),
  );
  return members
    .filter((person) => names.has(firstName(person.name).toLocaleLowerCase()))
    .map((person) => person.id);
}
export type Person = { id: string; name: string; isYou: boolean };
export type MemberEvent =
  | { type: "created"; by: Person }
  | { type: "added"; by: Person; people: Person[] }
  | { type: "joined" | "left"; person: Person }
  | { type: "removed"; by: Person; person: Person };
const subject = (person: Person) => (person.isYou ? "You" : person.name);
const object = (person: Person) => (person.isYou ? "you" : person.name);
export function eventSentence(event: MemberEvent): string {
  switch (event.type) {
    case "created":
      return `${subject(event.by)} created this group`;
    case "added":
      return `${subject(event.by)} added ${event.people.map(object).join(", ")}`;
    case "joined":
      return `${subject(event.person)} joined the group`;
    case "left":
      return `${subject(event.person)} left the group`;
    case "removed":
      return `${subject(event.by)} removed ${object(event.person)}`;
  }
  throw new Error("Unknown member event");
}
export function listPreview(preview: { by: Person | null; summary: string }, pair = false) {
  return preview.by && !pair ? `${subject(preview.by)}: ${preview.summary}` : preview.summary;
}
export function messageSummary(
  message:
    | { kind: "deleted" }
    | {
        kind: "post";
        body: string;
        attachments: readonly (
          | { kind: "image" }
          | { kind: "voice" }
          | { kind: "file"; name: string }
        )[];
      },
): string {
  if (message.kind === "deleted") return "Message deleted";
  if (message.body.trim()) return message.body;
  const attachment = message.attachments[0];
  if (!attachment) return "";
  if (attachment.kind === "image") return "Photo";
  return attachment.kind === "voice" ? "Voice note" : attachment.name;
}
export function timeLabel(timestamp: number, now = Date.now(), locale = "en-GB") {
  const date = new Date(timestamp),
    today = new Date(now);
  const day = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const other = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const days = (day - other) / 86_400_000;
  if (days === 0)
    return date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", hour12: false });
  if (days === 1) return "Yesterday";
  if (days > 1 && days < 7) return date.toLocaleDateString(locale, { weekday: "long" });
  return date.toLocaleDateString(locale, { day: "numeric", month: "short" });
}
export function fileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1).replace(/\.0$/u, "")} MB`;
}
export function duration(milliseconds: number) {
  const seconds = Math.floor(milliseconds / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
