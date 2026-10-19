// Display-ready shapes for the presentational screens. They follow the query results in
// build/api.md (names, avatar colors, labels already resolved) so the wiring lane only maps.

export type Notify = "mentions" | "all" | "muted";

export type Avatar =
  | {
      kind: "person";
      initials: string;
      /** The person's fixed color; initials sit on it in both themes. */
      color: string;
      /** The same color lightened until it meets contrast on dark surfaces; used for names. */
      colorOnDark: string;
      photoUrl: string | null;
    }
  | { kind: "group"; initials: string };

export type Person = {
  id: string;
  /** First word of the display name: author labels, typing and previews. */
  name: string;
  /** Full name: member lists and the account screen. */
  fullName: string;
  /** Empty unless the person was found by this exact address: members are shown without one. */
  email: string;
  avatar: Avatar;
  isYou: boolean;
  /** A deleted account: it has no pair to open. */
  deleted?: boolean;
};

export type Emoji = "👍" | "❤️" | "😂" | "😮" | "🙏";
export const EMOJI: readonly Emoji[] = ["👍", "❤️", "😂", "😮", "🙏"];

export type Reaction = {
  emoji: Emoji;
  count: number;
  mine: boolean;
  /** Names for the tooltip and the Reactions sheet, "You" first. */
  who: string;
};

export type SendState = "sent" | "sending" | "queued" | "failed";

export type Quote = { messageId: string; author: string; summary: string };

export type Segment =
  | { type: "text"; text: string }
  | { type: "mention"; text: string }
  | { type: "link"; text: string };

export type MessageContent =
  | { kind: "text"; segments: Segment[]; edited: boolean }
  | {
      kind: "image";
      caption: Segment[] | null;
      alt: string;
      uri: string | null;
      aspectRatio: number;
    }
  | { kind: "file"; name: string; size: string }
  | { kind: "voice"; durationSeconds: number; waveform: readonly number[] }
  | { kind: "deleted" };

export type Message = {
  id: string;
  timeLabel: string;
  mine: boolean;
  state: SendState;
  content: MessageContent;
  quote: Quote | null;
  reactions: Reaction[];
  /** The one-line summary used by the message sheet and reply bar. */
  summary: string;
  /** Plain text for "Copy text", or null when the message has none. */
  copyText: string | null;
  highlighted?: boolean;
};

export type TimelineItem =
  | { type: "day"; id: string; label: string }
  | { type: "unread"; id: string }
  | { type: "system"; id: string; segments: { text: string; strong: boolean }[] }
  | { type: "group"; id: string; author: Person; timeLabel: string; messages: Message[] };

export type GroupRow =
  | {
      status: "member";
      groupId: string;
      title: string;
      avatar: Avatar;
      /** Time today, else the day label. */
      whenLabel: string;
      preview: { by: { name: string; isYou: boolean } | null; summary: string };
      /** 0 hides the badge; the server stops counting at 100, shown as "99+". */
      unreadCount: number;
      needsYou: boolean;
      notify: Notify;
    }
  | {
      status: "removed";
      groupId: string;
      title: string;
      avatar: Avatar;
      removedBy: string;
      whenLabel: string;
    };

export type Member = Person;

export type GroupInfo = {
  groupId: string;
  kind: "group" | "pair";
  title: string;
  avatar: Avatar;
  memberCount: number;
  /** Pairs show the partner's email under the name. */
  partnerEmail: string | null;
  members: Member[];
  notify: Notify;
  inviteLink: string | null;
};

export type SearchHit = {
  groupId: string;
  sequence: number;
  groupTitle: string;
  groupAvatar: Avatar;
  author: string;
  whenLabel: string;
  /** Snippet split around the match so the screen can highlight it. */
  before: string;
  match: string;
  after: string;
};

export type Me = { person: Person; signedInWith: "Google" | "Apple" | "Email code" };
