import type { TimelineItem } from "../types";

type Who = { name: string; isYou: boolean };

/** A member event as `messages.range` sends it, as far as its sentence needs. */
export type GroupEvent =
  | { type: "created"; by: Who }
  | { type: "added"; by: Who; people: readonly Who[]; othersCount: number }
  | { type: "removed"; by: Who; person: Who }
  | { type: "joined"; person: Who }
  | { type: "left"; person: Who };

type Segment = { text: string; strong: boolean };

const label = (who: Who) => (who.isYou ? "You" : who.name);
const strong = (text: string): Segment => ({ text, strong: true });
const plain = (text: string): Segment => ({ text, strong: false });

/** "Bilal", "Bilal and Sara", "Bilal, Sara and Omar"; with others left over, "Bilal, Sara and 4 others". */
function names(people: readonly Who[], othersCount: number): Segment[] {
  const labels = people.map(label);
  const last = labels.at(-1);
  if (last === undefined) return [];
  if (othersCount > 0) return [strong(labels.join(", ")), plain(` and ${othersCount} others`)];
  if (labels.length === 1) return [strong(last)];
  return [strong(labels.slice(0, -1).join(", ")), plain(" and "), strong(last)];
}

/** The quiet centered line for an event: "Hasan added Bilal, Sara and 2 others". */
export function eventSegments(event: GroupEvent): Segment[] {
  if (event.type === "created") return [strong(label(event.by)), plain(" created this group")];
  if (event.type === "added")
    return [strong(label(event.by)), plain(" added "), ...names(event.people, event.othersCount)];
  if (event.type === "removed")
    return [strong(label(event.by)), plain(" removed "), ...names([event.person], 0)];
  if (event.type === "joined") return [...names([event.person], 0), plain(" joined")];
  return [...names([event.person], 0), plain(" left")];
}

/** The first line of a group of two, before anything else happens. */
const pairStart = (partner: Who): Segment[] => [
  plain("This is the start of your group with "),
  strong(partner.name),
];

/** The timeline of a group in J2: its member events, and the start line when it is a pair. */
export function eventItems(
  kind: "group" | "pair",
  partner: Who | null,
  events: readonly { id: string; event: GroupEvent }[],
): TimelineItem[] {
  const lines = events.map(({ id, event }): TimelineItem => ({
    type: "system",
    id,
    segments: eventSegments(event),
  }));
  if (kind === "pair" && partner)
    return [{ type: "system", id: "pair-start", segments: pairStart(partner) }, ...lines];
  return lines;
}
