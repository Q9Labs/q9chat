import type { Clock } from "../chat/format.js";
import type {
  Attachment,
  Author,
  Avatar,
  Emoji,
  EventView,
  GroupDetail,
  GroupListRow,
  GroupRow,
  Me,
  Member,
  MessageView,
  NotifyMode,
  PersonMatch,
  PersonRef,
  PostView,
  Reaction,
  RemovedGroup,
  SearchHit,
} from "../chat/types.js";

// Seed data copied from the approved mock: people, groups and messages, set on
// Sunday 18 October 2026 at 10:44 in UTC so every shot is repeatable.

export const CLOCK: Clock = { now: Date.UTC(2026, 9, 18, 10, 44), timeZone: "UTC" };

/** A time `daysAgo` days before the fixture day, as "HH:MM". */
function at(daysAgo: number, time: string): number {
  const [hour = 0, minute = 0] = time.split(":").map(Number);
  return Date.UTC(2026, 9, 18 - daysAgo, hour, minute);
}

const PEOPLE = {
  hasan: {
    name: "Hasan",
    full: "Hasan Shoaib",
    initials: "HS",
    color: "#6d28d9",
    email: "hasan@q9labs.ai",
  },
  shoaib: {
    name: "Shoaib",
    full: "Shoaib",
    initials: "SH",
    color: "#0f766e",
    email: "shoaib@q9labs.ai",
  },
  bilal: {
    name: "Bilal",
    full: "Bilal",
    initials: "BI",
    color: "#b45309",
    email: "bilal@q9labs.ai",
  },
  sara: { name: "Sara", full: "Sara", initials: "SA", color: "#be185d", email: "sara@q9labs.ai" },
  yahya: {
    name: "Yahya",
    full: "Yahya",
    initials: "YA",
    color: "#0369a1",
    email: "yahya@q9labs.ai",
  },
  omar: { name: "Omar", full: "Omar", initials: "OM", color: "#c2410c", email: "omar@q9labs.ai" },
  rana: { name: "Rana", full: "Rana", initials: "RA", color: "#4d7c0f", email: "rana@q9labs.ai" },
  nadia: {
    name: "Nadia",
    full: "Nadia",
    initials: "NA",
    color: "#b91c1c",
    email: "nadia@q9labs.ai",
  },
} as const;

type PersonKey = keyof typeof PEOPLE;

export interface Options {
  /** C5: long names and a long message. */
  readonly long?: boolean;
  /** The person using the app. */
  readonly me?: "hasan" | "nadia";
  readonly photo?: boolean;
}

const LONG_BILAL = "Bilal Ahmed Siddiqui-Rahmatullah";
const LONG_LAUNCH = "Q9 Chat launch, App Store review and the October release for web and phone";
const LONG_FILE = "release-checklist-for-app-store-review-final-version-3-october.pdf";
const LONG_TEXT =
  "Before the App Store review on Thursday we still need the privacy labels, screenshots in all three sizes, a demo account with a group that has photos, files and a voice note in it, and review notes that explain how invite links work. Everything is in https://docs.q9labs.ai/launch/app-store-review-checklist-october-2026-final-with-notes-from-bilal-and-sara";

export function avatarOf(key: PersonKey, photo = false): Avatar {
  const person = PEOPLE[key];
  return { photoUrl: photo ? PHOTO_URL : null, initials: person.initials, color: person.color };
}

const PHOTO_URL = `data:image/svg+xml;utf8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 72 72"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#a9bfd2"/><stop offset="1" stop-color="#617a94"/></linearGradient></defs><rect width="72" height="72" fill="url(#g)"/><ellipse cx="36" cy="72" rx="23" ry="17" fill="#33506f"/><circle cx="36" cy="29" r="14" fill="#e3bf9a"/></svg>',
)}`;

function nameOf(key: PersonKey, options: Options): string {
  return options.long === true && key === "bilal" ? LONG_BILAL : PEOPLE[key].name;
}

function ref(key: PersonKey, options: Options): PersonRef {
  return { id: key, name: nameOf(key, options), isYou: key === (options.me ?? "hasan") };
}

export function author(key: PersonKey, options: Options = {}): Author {
  return {
    ...ref(key, options),
    avatar: avatarOf(key, key === (options.me ?? "hasan") && options.photo === true),
  };
}

export function member(key: PersonKey, options: Options = {}): Member {
  return {
    ...author(key, options),
    fullName: options.long === true && key === "bilal" ? LONG_BILAL : PEOPLE[key].full,
    email: PEOPLE[key].email,
  };
}

export function match(key: PersonKey, options: Options = {}): PersonMatch {
  const person = member(key, options);
  return { ...author(key, options), fullName: person.fullName, email: person.email };
}

export function me(options: Options = {}): Me {
  const key = options.me ?? "hasan";
  return {
    displayName: key === "hasan" ? PEOPLE.hasan.full : PEOPLE.nadia.name,
    email: PEOPLE[key].email,
    avatar: avatarOf(key, options.photo === true),
    provider: key === "hasan" ? "Google" : "Email code",
  };
}

// ---------- the initials collage used for photos ----------

const LIGHT = "#fafafa";
const DARK = "#111214";

function collage(): string {
  const tiles = Object.values(PEOPLE);
  // Two 160px panels, 4 columns each, 12px top and 10px side padding, 6px gap.
  const cell = (320 / 2 - 20 - 18) / 4;
  const panel = (offset: number, fill: string) =>
    `<rect x="${offset}" width="160" height="91" fill="${fill}"/>` +
    tiles
      .map((person, index) => {
        const x = offset + 10 + (index % 4) * (cell + 6);
        const y = 12 + Math.floor(index / 4) * (cell + 6);
        return `<circle cx="${x + cell / 2}" cy="${y + cell / 2}" r="${cell / 2}" fill="${person.color}"/><text x="${x + cell / 2}" y="${y + cell / 2 + 3}" font-family="Figtree, sans-serif" font-size="8" font-weight="700" fill="#fff" text-anchor="middle">${person.initials}</text>`;
      })
      .join("");
  return `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 91" width="320" height="91">${panel(0, LIGHT)}${panel(160, DARK)}</svg>`)}`;
}

const PHOTO_ATTACHMENT: Attachment = {
  kind: "image",
  url: collage(),
  width: 320,
  height: 91,
  label: "Photo: initials on eight colors, light and dark",
};

/** The mock's deterministic 38-bar waveform for a message id. */
function waveformFor(id: string): readonly number[] {
  let state = 7;
  for (let index = 0; index < id.length; index += 1) {
    state = (state * 31 + id.charCodeAt(index)) % 9973;
  }
  return Array.from({ length: 38 }, (_, bar) => {
    state = (state * 9301 + 49297) % 233280;
    return (state / 233280) * (0.55 + 0.45 * Math.sin(bar / 4));
  });
}

/** The mock's deterministic 30 recording levels. */
export function recordingLevels(): readonly number[] {
  let state = 11;
  return Array.from({ length: 30 }, (_, bar) => {
    state = (state * 9301 + 49297) % 233280;
    return (state / 233280) * (0.55 + 0.45 * Math.sin(bar / 4));
  });
}

// ---------- messages ----------

interface PostInit {
  readonly seq: number;
  readonly id: string;
  readonly by: PersonKey;
  readonly day: number;
  readonly time: string;
  readonly body: string;
  readonly attachments?: readonly Attachment[];
  readonly replyTo?: PostView["replyTo"];
  readonly reactions?: readonly (readonly [Emoji, readonly PersonKey[]])[];
  readonly edited?: boolean;
  readonly sendState?: PostView["sendState"];
}

function reactions(list: PostInit["reactions"], options: Options): readonly Reaction[] {
  return (list ?? []).map(([emoji, who]) => ({
    emoji,
    count: who.length,
    mine: who.includes(options.me ?? "hasan"),
    people: who.map((key) => ref(key, options)),
  }));
}

function post(init: PostInit, options: Options): PostView {
  const mentions = [...init.body.matchAll(/@(\w+)/g)].map((hit) => hit[1] ?? "");
  const base = {
    kind: "post",
    id: init.id,
    sequence: init.seq,
    createdAt: at(init.day, init.time),
    author: author(init.by, options),
    body: init.body,
    mentions,
    attachments: init.attachments ?? [],
    replyTo: init.replyTo ?? null,
    reactions: reactions(init.reactions, options),
    editedAt: init.edited === true ? at(init.day, init.time) + 60_000 : null,
  } as const;
  return init.sendState === undefined ? base : { ...base, sendState: init.sendState };
}

function quote(of: PostView): NonNullable<PostView["replyTo"]> {
  return {
    id: of.id,
    sequence: of.sequence,
    author: { id: of.author.id, name: of.author.name, isYou: of.author.isYou },
    summary: summaryOf(of),
  };
}

function summaryOf(message: PostView): string {
  const first = message.attachments[0];
  if (first?.kind === "image") return message.body === "" ? "Photo" : `Photo · ${message.body}`;
  if (first?.kind === "file") return first.name;
  if (first?.kind === "voice") return "Voice note · 0:24";
  return message.body;
}

function event(
  seq: number,
  id: string,
  day: number,
  time: string,
  shape: EventView["event"],
): EventView {
  return { kind: "event", id, sequence: seq, createdAt: at(day, time), event: shape };
}

export function launchMessages(options: Options = {}): readonly MessageView[] {
  const l = (init: Omit<PostInit, "seq">, seq: number) => post({ ...init, seq }, options);
  const l7 = l(
    {
      id: "l7",
      by: "shoaib",
      day: 0,
      time: "09:58",
      body: "Morning. Where are we on the first build?",
    },
    7,
  );
  const l2 = l(
    {
      id: "l2",
      by: "hasan",
      day: 1,
      time: "16:10",
      body: "Can we keep muted groups quiet? A grey count, not blue.",
    },
    2,
  );
  const l8 = l(
    {
      id: "l8",
      by: "hasan",
      day: 0,
      time: "10:01",
      body: "Web goes up on chat.q9labs.ai tonight. Phone builds are going through EAS.",
      replyTo: quote(l7),
    },
    8,
  );
  const list: MessageView[] = [
    l(
      {
        id: "l1",
        by: "sara",
        day: 1,
        time: "16:02",
        body: "Avatar colors are in Figma. Eight colors, and each person keeps one everywhere.",
      },
      1,
    ),
    l2,
    l(
      {
        id: "l3",
        by: "shoaib",
        day: 1,
        time: "16:12",
        body: "Yes. Blue only when something needs you.",
        reactions: [["👍", ["hasan", "sara"]]],
      },
      3,
    ),
    l(
      {
        id: "l4",
        by: "sara",
        day: 1,
        time: "17:45",
        body: "Initials on all eight colors, light and dark.",
        attachments: [PHOTO_ATTACHMENT],
      },
      4,
    ),
    l(
      {
        id: "l5",
        by: "hasan",
        day: 1,
        time: "17:50",
        body: "Love these. Ship them.",
        reactions: [["❤️", ["sara", "bilal"]]],
      },
      5,
    ),
    l(
      { id: "l6", by: "omar", day: 1, time: "18:20", body: "I'll use the same colors in Chalk." },
      6,
    ),
    l7,
    l8,
    l(
      {
        id: "l9",
        by: "bilal",
        day: 0,
        time: "10:05",
        body: "Apple account is ready under CollabEZ. I'll add everyone to TestFlight once the build lands.",
        reactions: [
          ["👍", ["hasan", "shoaib"]],
          ["🙏", ["sara"]],
        ],
      },
      9,
    ),
    l(
      {
        id: "l10",
        by: "shoaib",
        day: 0,
        time: "10:31",
        body: "",
        attachments: [
          { kind: "voice", url: "/voice/l10", durationMs: 24_000, waveform: waveformFor("l10") },
        ],
      },
      10,
    ),
    l(
      {
        id: "l11",
        by: "sara",
        day: 0,
        time: "10:36",
        body: "Done. Muted groups now show a grey count everywhere.",
        replyTo: quote(l2),
        edited: true,
      },
      11,
    ),
    l(
      {
        id: "l12",
        by: "bilal",
        day: 0,
        time: "10:40",
        body: "Build 1 is up on TestFlight. @Hasan can you try sign in with Apple?",
        replyTo: quote(l8),
      },
      12,
    ),
    l(
      {
        id: "l13",
        by: "bilal",
        day: 0,
        time: "10:42",
        body: "",
        attachments: [
          {
            kind: "file",
            url: "/files/l13",
            name: options.long === true ? LONG_FILE : "release-checklist.pdf",
            size: 86_016,
          },
        ],
      },
      13,
    ),
  ];
  if (options.long === true)
    list.push(l({ id: "lx", by: "sara", day: 0, time: "10:43", body: LONG_TEXT }, 14));
  return list;
}

/** The mock's failed-send fixture (C3). */
export function failedMessage(options: Options = {}): PostView {
  return post(
    {
      seq: 99,
      id: "f1",
      by: "hasan",
      day: 0,
      time: "10:45",
      body: "Trying sign in with Apple now.",
      sendState: "failed",
    },
    options,
  );
}

export function queuedMessage(options: Options = {}): PostView {
  return post(
    {
      seq: 99,
      id: "q1",
      by: "hasan",
      day: 0,
      time: "10:45",
      body: "Trying sign in with Apple now.",
      sendState: "queued",
    },
    options,
  );
}

export function sendingMessage(options: Options = {}): PostView {
  return post(
    {
      seq: 99,
      id: "s1",
      by: "hasan",
      day: 0,
      time: "10:45",
      body: "Trying sign in with Apple now.",
      sendState: "sending",
    },
    options,
  );
}

/** A removal event, as "Shoaib removed Omar". */
export function removalLine(options: Options = {}): EventView {
  return event(100, "e1", 0, "10:44", {
    type: "removed",
    by: author("shoaib", options),
    people: [author("omar", options)],
  });
}

export function createdLines(options: Options = {}): readonly EventView[] {
  return [
    event(1, "e0", 0, "10:44", { type: "created", by: author("hasan", options) }),
    event(2, "e0b", 0, "10:44", {
      type: "added",
      by: author("hasan", options),
      people: [author("sara", options), author("bilal", options)],
    }),
    event(3, "e0c", 0, "10:44", { type: "start", people: [author("shoaib", options)] }),
  ];
}

export function pairMessages(options: Options = {}): readonly MessageView[] {
  const p = (init: PostInit) => post(init, options);
  return [
    p({
      seq: 1,
      id: "s1",
      by: "shoaib",
      day: 1,
      time: "21:14",
      body: "Did you see the Chalk numbers?",
    }),
    p({
      seq: 2,
      id: "s2",
      by: "hasan",
      day: 1,
      time: "21:20",
      body: "Yes. Retention is up again. Talk tomorrow.",
    }),
    p({
      seq: 3,
      id: "s3",
      by: "shoaib",
      day: 0,
      time: "10:29",
      body: "Can you look at the Chalk deck before 3?",
    }),
    p({ seq: 4, id: "s4", by: "shoaib", day: 0, time: "10:31", body: "Slides 4 to 9 are new." }),
  ];
}

// ---------- groups ----------

function groupAvatar(initials: string): Avatar {
  return { photoUrl: null, initials, color: null };
}

interface GroupInit {
  readonly id: string;
  readonly title: string;
  readonly avatar: Avatar;
  readonly kind: "group" | "pair";
  readonly last: number;
  readonly by: PersonKey | null;
  readonly summary: string;
  readonly unread: number;
  readonly needsYou?: boolean;
  readonly notify?: NotifyMode;
}

function row(init: GroupInit, options: Options): GroupRow {
  return {
    status: "member",
    groupId: init.id,
    kind: init.kind,
    title: init.title,
    avatar: init.avatar,
    lastActivityAt: init.last,
    preview: { by: init.by === null ? null : ref(init.by, options), summary: init.summary },
    unreadCount: init.unread,
    needsYou: init.needsYou === true,
    notify: init.notify ?? "mentions",
  };
}

export function groupRows(
  options: Options = {},
  opened: string | null = null,
): readonly GroupListRow[] {
  const long = options.long === true;
  return readOpened(
    [
      row(
        {
          id: "launch",
          title: long ? LONG_LAUNCH : "Q9 Chat launch",
          avatar: groupAvatar("QL"),
          kind: "group",
          last: at(0, long ? "10:43" : "10:42"),
          by: long ? "sara" : "bilal",
          summary: long ? LONG_TEXT : "release-checklist.pdf",
          unread: 4,
          needsYou: true,
        },
        options,
      ),
      row(
        {
          id: "shoaib",
          title: "Shoaib",
          avatar: avatarOf("shoaib"),
          kind: "pair",
          last: at(0, "10:31"),
          by: "shoaib",
          summary: "Slides 4 to 9 are new.",
          unread: 2,
        },
        options,
      ),
      row(
        {
          id: "chalk",
          title: "Chalk",
          avatar: groupAvatar("CH"),
          kind: "group",
          last: at(0, "10:12"),
          by: "shoaib",
          summary: "Let's look at it after lunch.",
          unread: 3,
        },
        options,
      ),
      row(
        {
          id: "core",
          title: "Q9 Core",
          avatar: groupAvatar("Q9"),
          kind: "group",
          last: at(0, "09:50"),
          by: "yahya",
          summary: "Payroll for October is done.",
          unread: 0,
        },
        options,
      ),
      row(
        {
          id: "bilal",
          title: nameOf("bilal", options),
          avatar: avatarOf("bilal"),
          kind: "pair",
          last: at(1, "19:12"),
          by: "hasan",
          summary: "Sounds good, thanks.",
          unread: 0,
        },
        options,
      ),
      row(
        {
          id: "design",
          title: "Design",
          avatar: groupAvatar("DE"),
          kind: "group",
          last: at(1, "16:05"),
          by: "sara",
          summary: "Initials on all eight colors are final.",
          unread: 5,
        },
        options,
      ),
      row(
        {
          id: "sara",
          title: "Sara",
          avatar: avatarOf("sara"),
          kind: "pair",
          last: at(3, "12:30"),
          by: "hasan",
          summary: "The bold initials. They read well at small sizes.",
          unread: 0,
        },
        options,
      ),
      row(
        {
          id: "random",
          title: "Random",
          avatar: groupAvatar("RA"),
          kind: "group",
          last: at(6, "12:40"),
          by: "omar",
          summary: "Done. Table at 1.",
          unread: 9,
          notify: "muted",
        },
        options,
      ),
    ],
    opened,
  );
}

/** Opening a group reads it: the mock clears the count and the @ when the chat is on screen. */
function readOpened(rows: readonly GroupRow[], opened: string | null): readonly GroupRow[] {
  return rows.map((entry) =>
    entry.groupId === opened ? { ...entry, unreadCount: 0, needsYou: false } : entry,
  );
}

export function withMuted(rows: readonly GroupListRow[], groupId: string): readonly GroupListRow[] {
  return rows.map((entry) =>
    entry.status === "member" && entry.groupId === groupId ? { ...entry, notify: "muted" } : entry,
  );
}

/** Replaces a row with the "Shoaib removed you" row. */
export function withRemoved(
  rows: readonly GroupListRow[],
  groupId: string,
): readonly GroupListRow[] {
  return rows.map((entry) =>
    entry.groupId === groupId
      ? {
          status: "removed",
          groupId,
          kind: entry.kind,
          title: entry.title,
          avatar: entry.avatar,
          removedBy: "Shoaib",
          removedAt: at(0, "10:44"),
        }
      : entry,
  );
}

export function launchGroup(options: Options & { readonly notify?: NotifyMode } = {}): GroupDetail {
  const keys: PersonKey[] = ["hasan", "shoaib", "bilal", "sara", "omar"];
  return {
    status: "member",
    groupId: "launch",
    kind: "group",
    title: options.long === true ? LONG_LAUNCH : "Q9 Chat launch",
    avatar: groupAvatar("QL"),
    memberCount: 5,
    members: keys.map((key) => member(key, options)),
    notify: options.notify ?? "mentions",
    inviteToken: "k7Pq2x",
    lastSequence: 13,
    lastReadSequence: 9,
  };
}

export function pairGroup(options: Options & { readonly notify?: NotifyMode } = {}): GroupDetail {
  return {
    status: "member",
    groupId: "shoaib",
    kind: "pair",
    title: "Shoaib",
    avatar: avatarOf("shoaib"),
    memberCount: 2,
    members: [member("hasan", options), member("shoaib", options)],
    partner: member("shoaib", options),
    notify: options.notify ?? "mentions",
    lastSequence: 4,
    lastReadSequence: 2,
  };
}

export function removedGroup(options: Options = {}): RemovedGroup {
  return {
    status: "removed",
    title: options.long === true ? LONG_LAUNCH : "Q9 Chat launch",
    avatar: groupAvatar("QL"),
    removedBy: "Shoaib",
    removedAt: at(0, "10:44"),
  };
}

export const TYPING_SHOAIB: readonly string[] = ["Shoaib"];

// ---------- search ----------

/** The mock's snippet rule: start about 36 characters before the match, at a word, with an ellipsis. */
function snippetOf(text: string, query: string): string {
  const found = text.toLowerCase().indexOf(query.toLowerCase());
  let start = Math.max(0, found - 36);
  if (start > 0) {
    const space = text.indexOf(" ", start);
    if (space > -1 && space < found) start = space + 1;
  }
  return `${start > 0 ? "…" : ""}${text.slice(start, found + query.length + 140)}`;
}

export function searchHits(options: Options = {}): readonly SearchHit[] {
  const hit = (
    groupId: string,
    groupTitle: string,
    groupAvatarData: Avatar,
    sequence: number,
    by: PersonKey,
    day: number,
    time: string,
    snippet: string,
  ): SearchHit => ({
    groupId,
    groupTitle,
    groupAvatar: groupAvatarData,
    sequence,
    author: author(by, options),
    createdAt: at(day, time),
    snippet: snippetOf(snippet, "TestFlight"),
  });
  return [
    hit(
      "launch",
      options.long === true ? LONG_LAUNCH : "Q9 Chat launch",
      groupAvatar("QL"),
      12,
      "bilal",
      0,
      "10:40",
      "Build 1 is up on TestFlight. @Hasan can you try sign in with Apple?",
    ),
    hit(
      "launch",
      options.long === true ? LONG_LAUNCH : "Q9 Chat launch",
      groupAvatar("QL"),
      9,
      "bilal",
      0,
      "10:05",
      "Apple account is ready under CollabEZ. I'll add everyone to TestFlight once the build lands.",
    ),
    hit(
      "bilal",
      nameOf("bilal", options),
      avatarOf("bilal"),
      1,
      "hasan",
      18,
      "18:02",
      "Can you send me the TestFlight invite when it's ready?",
    ),
    hit(
      "chalk",
      "Chalk",
      groupAvatar("CH"),
      1,
      "omar",
      6,
      "14:02",
      "TestFlight build for Chalk is next week.",
    ),
  ];
}
