// Turns the mock's seed into the display-ready props the screens take. It mirrors the mock's own
// helpers (grouping, previews, snippets) so a gallery state reads the same as the mock state.
import { EMOJI, type Avatar, type GroupInfo, type GroupRow, type Message, type Person, type Reaction, type SearchHit, type Segment, type TimelineItem } from "../types";
import { GROUPS, LONG_FILE, LONG_GROUP, LONG_PERSON, MESSAGES, PEOPLE, type SeedGroup, type SeedMessage } from "./seed";

export const ME = "hasan";
export const ME_FULL_NAME = "Hasan Shoaib";

export type SystemAct = { act: "created" | "added" | "removed" | "start"; by: string; who?: string[] };
export type FixtureMessage = Omit<SeedMessage, "kind"> & {
  kind: SeedMessage["kind"];
  state?: Message["state"];
  deleted?: boolean;
  system?: SystemAct;
  highlighted?: boolean;
};

export type World = {
  long: boolean;
  /** Messages added to a group on top of the seed. */
  append: Record<string, FixtureMessage[]>;
  /** Per-message overrides such as `{ state: "failed" }` or `{ deleted: true }`. */
  patch: Record<string, Partial<FixtureMessage>>;
  muted: ReadonlySet<string>;
};

export const defaultWorld = (): World => ({ long: false, append: {}, patch: {}, muted: new Set(["random"]) });

const DAY_NAME = { Today: "Today", Yesterday: "Yesterday", Thu: "Thursday", Mon: "Monday", "30 Sep": "30 September" } as const;
const DAY_OFFSET = { Today: 0, Yesterday: -1, Thu: -3, Mon: -6, "30 Sep": -18 } as const;
const minutes = (time: string) => {
  const [h = "0", mm = "0"] = time.split(":");
  return Number(h) * 60 + Number(mm);
};
const stamp = (message: FixtureMessage) => DAY_OFFSET[message.day] * 1440 + minutes(message.time);

export const firstName = (id: string, world: World) => (id === "bilal" && world.long ? LONG_PERSON : (PEOPLE[id]?.name ?? id));
const fullName = (id: string, world: World) => (id === ME ? ME_FULL_NAME : firstName(id, world));

export const PHOTO_URI = "https://q9chat.invalid/fixture-photo.png";

export function avatarOf(id: string, photoUri: string | null = null): Avatar {
  const person = PEOPLE[id];
  if (!person) throw new Error(`Unknown fixture person ${id}`);
  return { kind: "person", initials: person.initials, color: person.color, colorOnDark: person.colorOnDark, photoUrl: photoUri };
}

export function personOf(id: string, world: World, photoUri: string | null = null): Person {
  const person = PEOPLE[id];
  if (!person) throw new Error(`Unknown fixture person ${id}`);
  return {
    id,
    name: firstName(id, world),
    fullName: fullName(id, world),
    email: person.email,
    avatar: avatarOf(id, id === ME ? photoUri : null),
    isYou: id === ME,
  };
}

export const groupById = (id: string): SeedGroup => {
  const group = GROUPS.find((g) => g.id === id);
  if (!group) throw new Error(`Unknown fixture group ${id}`);
  return group;
};

export const groupTitle = (group: SeedGroup, world: World) =>
  group.pair ? firstName(group.pair, world) : world.long && group.id === "launch" ? LONG_GROUP : (group.name ?? group.id);

export const groupAvatar = (group: SeedGroup): Avatar => (group.pair ? avatarOf(group.pair) : { kind: "group", initials: group.initials ?? "?" });

export function visibleMessages(groupId: string, world: World): FixtureMessage[] {
  const seeded: FixtureMessage[] = (MESSAGES[groupId] ?? []).filter((message) => !message.long || world.long);
  return [...seeded, ...(world.append[groupId] ?? [])].map((message) => ({ ...message, ...world.patch[message.id] }));
}

function joinNames(names: readonly string[]): string {
  if (names.length < 2) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

const fileName = (message: FixtureMessage, world: World) => (world.long && message.id === "l13" ? LONG_FILE : message.text);

function systemText(message: FixtureMessage, world: World): string {
  const sys = message.system;
  if (!sys) return "";
  const actor = sys.by === ME ? "You" : firstName(sys.by, world);
  const list = joinNames((sys.who ?? []).map((id) => (id === ME ? "You" : firstName(id, world))));
  if (sys.act === "created") return `${actor} created this group`;
  if (sys.act === "added") return `${actor} added ${list}`;
  if (sys.act === "removed") return `${actor} removed ${list}`;
  return `This is the start of your group with ${list}`;
}

const formatDuration = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

export function summaryOf(message: FixtureMessage, world: World): string {
  if (message.kind === "system") return systemText(message, world);
  if (message.deleted) return "Message deleted";
  if (message.kind === "voice") return `Voice note · ${formatDuration(message.duration ?? 0)}`;
  if (message.kind === "image") return message.text ? `Photo · ${message.text}` : "Photo";
  if (message.kind === "file") return fileName(message, world);
  return message.text;
}

const URL_RE = /https?:\/\/\S+/g;
const NAME_RE = /@(Hasan|Shoaib|Bilal|Sara|Yahya|Omar|Rana|Nadia)\b/g;

export function segmentsOf(text: string): Segment[] {
  const out: Segment[] = [];
  let last = 0;
  const pushNames = (chunk: string) => {
    let from = 0;
    for (const match of chunk.matchAll(NAME_RE)) {
      const at = match.index ?? 0;
      if (at > from) out.push({ type: "text", text: chunk.slice(from, at) });
      out.push({ type: "mention", text: match[0] });
      from = at + match[0].length;
    }
    if (from < chunk.length) out.push({ type: "text", text: chunk.slice(from) });
  };
  for (const match of text.matchAll(URL_RE)) {
    const at = match.index ?? 0;
    pushNames(text.slice(last, at));
    out.push({ type: "link", text: match[0] });
    last = at + match[0].length;
  }
  pushNames(text.slice(last));
  return out;
}

// The mock's deterministic waveform: heights 5..24px, converted to the 0..1 samples the kit takes.
export function waveSamples(seed: number, count = 38): number[] {
  let s = seed;
  const out: number[] = [];
  for (let k = 0; k < count; k++) {
    s = (s * 9301 + 49297) % 233280;
    const h = 5 + Math.round((s / 233280) * 19 * (0.55 + 0.45 * Math.sin(k / 4)));
    out.push((Math.max(4, h) - 4) / 20);
  }
  return out;
}
const seedOf = (id: string) => [...id].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 9973, 7);

function reactionsOf(message: FixtureMessage, world: World): Reaction[] {
  if (message.deleted) return [];
  const out: Reaction[] = [];
  for (const emoji of EMOJI) {
    const people = message.reactions?.[emoji] ?? [];
    if (!people.length) continue;
    const mine = people.includes(ME);
    const names = mine ? ["You", ...people.filter((id) => id !== ME).map((id) => firstName(id, world))] : people.map((id) => firstName(id, world));
    out.push({ emoji, count: people.length, mine, who: joinNames(names) });
  }
  return out;
}

function toMessage(message: FixtureMessage, all: readonly FixtureMessage[], world: World): Message {
  const mine = message.by === ME;
  const quoted = message.quote ? all.find((other) => other.id === message.quote) : undefined;
  const base = {
    id: message.id,
    timeLabel: message.time,
    mine,
    state: message.state ?? "sent",
    quote: quoted
      ? { messageId: quoted.id, author: quoted.by === ME ? "You" : firstName(quoted.by, world), summary: quoted.deleted ? "Message deleted" : summaryOf(quoted, world) }
      : null,
    reactions: reactionsOf(message, world),
    summary: summaryOf(message, world),
    highlighted: message.highlighted ?? false,
  };
  if (message.deleted) return { ...base, content: { kind: "deleted" }, copyText: null };
  if (message.kind === "voice") return { ...base, content: { kind: "voice", durationSeconds: message.duration ?? 0, waveform: waveSamples(seedOf(message.id)) }, copyText: null };
  if (message.kind === "file") return { ...base, content: { kind: "file", name: fileName(message, world), size: message.size ?? "" }, copyText: null };
  if (message.kind === "image") {
    return {
      ...base,
      content: { kind: "image", caption: message.text ? segmentsOf(message.text) : null, alt: "Photo: initials on eight colors, light and dark", uri: null, aspectRatio: 1.5 },
      copyText: message.text || null,
    };
  }
  return { ...base, content: { kind: "text", segments: segmentsOf(message.text), edited: message.edited ?? false }, copyText: message.text };
}

export type TimelineOptions = { unread: number; typing: number };

export const typersOf = (group: SeedGroup, count: number, world: World): string | null => {
  const order = ["shoaib", "bilal", "sara", "yahya", "omar", "rana", "hasan", "nadia"];
  const names = order.filter((id) => id !== ME && group.members.includes(id)).map((id) => firstName(id, world));
  const n = Math.min(count, names.length);
  if (!n) return null;
  if (n === 1) return `${names[0]} is typing`;
  if (n === 2) return `${names[0]} and ${names[1]} are typing`;
  return `${n} people are typing`;
};

/** Day separators, the unread divider, system lines and one group per run by one person under five minutes. */
export function timelineOf(groupId: string, world: World, unread: number): TimelineItem[] {
  const messages = visibleMessages(groupId, world);
  const incoming = messages.filter((message) => message.kind !== "system" && message.by !== ME);
  const dividerBefore = unread > 0 ? incoming.at(-unread)?.id : undefined;

  const items: TimelineItem[] = [];
  let day: string | null = null;
  let run: { by: string; messages: FixtureMessage[] } | null = null;
  const close = () => {
    if (!run) return;
    const first = run.messages[0];
    if (first) {
      items.push({
        type: "group",
        id: `g-${first.id}`,
        author: personOf(run.by, world),
        timeLabel: first.time,
        messages: run.messages.map((message) => toMessage(message, messages, world)),
      });
    }
    run = null;
  };

  for (const message of messages) {
    if (message.day !== day) {
      close();
      items.push({ type: "day", id: `day-${message.day}`, label: DAY_NAME[message.day] });
      day = message.day;
    }
    if (dividerBefore === message.id) {
      close();
      items.push({ type: "unread", id: "unread" });
    }
    if (message.kind === "system") {
      close();
      items.push({ type: "system", id: message.id, segments: systemSegments(message, world) });
      continue;
    }
    const last = run?.messages.at(-1);
    if (run && run.by === message.by && last && minutes(message.time) - minutes(last.time) < 5) run.messages.push(message);
    else {
      close();
      run = { by: message.by, messages: [message] };
    }
  }
  close();
  return items;
}

function systemSegments(message: FixtureMessage, world: World): { text: string; strong: boolean }[] {
  const sys = message.system;
  if (!sys) return [];
  const name = (id: string) => (id === ME ? "You" : firstName(id, world));
  const list = joinNames((sys.who ?? []).map(name));
  const actor = name(sys.by);
  if (sys.act === "created") return [{ text: actor, strong: true }, { text: " created this group", strong: false }];
  if (sys.act === "added") return [{ text: actor, strong: true }, { text: " added ", strong: false }, { text: list, strong: true }];
  if (sys.act === "removed") return [{ text: actor, strong: true }, { text: " removed ", strong: false }, { text: list, strong: true }];
  return [{ text: "This is the start of your group with ", strong: false }, { text: list, strong: true }];
}

const whenOf = (message: FixtureMessage) => (message.day === "Today" ? message.time : message.day);

export type RowOptions = { unreadOn: boolean; removedGroupIds: readonly string[]; removedBy: string };

export function rowsOf(world: World, options: RowOptions): GroupRow[] {
  const groups = GROUPS.filter((group) => visibleMessages(group.id, world).length > 0 || options.removedGroupIds.includes(group.id));
  const sorted = groups
    .map((group) => ({ group, last: visibleMessages(group.id, world).at(-1) }))
    .sort((a, b) => (b.last ? stamp(b.last) : 1e9) - (a.last ? stamp(a.last) : 1e9));
  return sorted.map(({ group, last }): GroupRow => {
    const title = groupTitle(group, world);
    if (options.removedGroupIds.includes(group.id)) {
      return { status: "removed", groupId: group.id, title, avatar: groupAvatar(group), removedBy: firstName(options.removedBy, world), whenLabel: last ? whenOf(last) : "" };
    }
    const by =
      !last || last.kind === "system" || (group.pair && last.by !== ME)
        ? null
        : { name: last.by === ME ? "You" : firstName(last.by, world), isYou: last.by === ME };
    return {
      status: "member",
      groupId: group.id,
      title,
      avatar: groupAvatar(group),
      whenLabel: last ? whenOf(last) : "",
      preview: { by, summary: last ? summaryOf(last, world) : "" },
      unreadCount: options.unreadOn ? group.unread : 0,
      needsYou: options.unreadOn && !!group.mentions,
      notify: world.muted.has(group.id) ? "muted" : "mentions",
    };
  });
}

export function infoOf(groupId: string, world: World): GroupInfo {
  const group = groupById(groupId);
  return {
    groupId,
    kind: group.pair ? "pair" : "group",
    title: groupTitle(group, world),
    avatar: groupAvatar(group),
    memberCount: group.members.length,
    partnerEmail: group.pair ? (PEOPLE[group.pair]?.email ?? null) : null,
    members: group.members.map((id) => personOf(id, world)),
    notify: world.muted.has(groupId) ? "muted" : "mentions",
    inviteLink: group.link ? `chat.q9labs.ai/join/${group.link}` : null,
  };
}

function snippetOf(text: string, query: string): { before: string; match: string; after: string } {
  const at = text.toLowerCase().indexOf(query.toLowerCase());
  let start = Math.max(0, at - 36);
  if (start > 0) {
    const space = text.indexOf(" ", start);
    if (space > -1 && space < at) start = space + 1;
  }
  return { before: `${start > 0 ? "…" : ""}${text.slice(start, at)}`, match: text.slice(at, at + query.length), after: text.slice(at + query.length, at + query.length + 140) };
}

export function searchOf(query: string, world: World, scopeGroupId: string | null): SearchHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const hits: { hit: SearchHit; at: number }[] = [];
  for (const group of GROUPS) {
    if (scopeGroupId && group.id !== scopeGroupId) continue;
    const messages = visibleMessages(group.id, world);
    messages.forEach((message, index) => {
      if (message.deleted || message.kind === "system" || message.kind === "voice") return;
      const text = message.kind === "file" ? fileName(message, world) : message.text;
      if (!text || !text.toLowerCase().includes(q)) return;
      hits.push({
        at: stamp(message),
        hit: {
          groupId: group.id,
          sequence: index + 1,
          groupTitle: groupTitle(group, world),
          groupAvatar: groupAvatar(group),
          author: message.by === ME ? "You" : firstName(message.by, world),
          whenLabel: whenOf(message),
          ...snippetOf(text, q),
        },
      });
    });
  }
  return hits.sort((a, b) => b.at - a.at).map(({ hit }) => hit);
}
