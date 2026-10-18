// Display-ready shapes for the chat screens. They follow the query results in
// `build/api.md` (groups.list, groups.get, messages.range, people.find,
// messages.search, profiles.me) so the wiring lane passes results through.
// Fields the queries leave open are documented where they are declared.

export type NotifyMode = "mentions" | "all" | "muted";

export const EMOJIS = ["👍", "❤️", "😂", "😮", "🙏"] as const;
export type Emoji = (typeof EMOJIS)[number];

/** Initials on a color fixed by the person's id, or their photo. `color: null` is a group. */
export interface Avatar {
  readonly photoUrl: string | null;
  readonly initials: string;
  readonly color: string | null;
}

/** Every person in a query result carries `id` and `isYou`, so the apps never match by name. */
export interface PersonRef {
  readonly id: string;
  /** The first word of the display name. */
  readonly name: string;
  readonly isYou: boolean;
}

export interface Author extends PersonRef {
  readonly deleted?: boolean;
  readonly avatar: Avatar;
}

export interface Member extends Author {
  readonly fullName: string;
}

// ---------- groups.list ----------

export interface Preview {
  /** The last sender, or null when the last line is an event sentence. */
  readonly by: PersonRef | null;
  readonly summary: string;
}

export interface GroupRow {
  readonly status: "member";
  readonly groupId: string;
  readonly kind: "group" | "pair";
  readonly title: string;
  readonly avatar: Avatar;
  readonly lastActivityAt: number;
  readonly preview: Preview;
  /** Counts stop at 100; the list shows "99+". */
  readonly unreadCount: number;
  readonly needsYou: boolean;
  readonly notify: NotifyMode;
}

export interface RemovedRow {
  readonly status: "removed";
  readonly groupId: string;
  readonly kind: "group" | "pair";
  readonly title: string;
  readonly avatar: Avatar;
  readonly removedBy: string;
  readonly removedAt: number;
}

export type GroupListRow = GroupRow | RemovedRow;

// ---------- groups.get ----------

export interface GroupDetail {
  readonly status: "member";
  readonly groupId: string;
  readonly kind: "group" | "pair";
  readonly title: string;
  readonly avatar: Avatar;
  readonly memberCount: number;
  readonly members: readonly Member[];
  /** The other person in a pair. */
  readonly partner?: Member;
  readonly notify: NotifyMode;
  readonly inviteToken?: string;
  readonly lastSequence: number;
  readonly lastReadSequence: number;
}

export interface RemovedGroup {
  readonly status: "removed";
  readonly title: string;
  readonly avatar: Avatar;
  readonly removedBy: string;
  readonly removedAt: number;
}

// ---------- messages.range ----------

export type Attachment =
  | {
      readonly kind: "image";
      readonly url: string;
      readonly width: number;
      readonly height: number;
      readonly label: string;
    }
  | { readonly kind: "file"; readonly url: string; readonly name: string; readonly size: number }
  | {
      readonly kind: "voice";
      readonly url: string;
      readonly durationMs: number;
      /** Peak levels from 0 to 1, drawn as the waveform. */
      readonly waveform: readonly number[];
    };

export interface Reaction {
  readonly emoji: Emoji;
  readonly count: number;
  readonly mine: boolean;
  readonly people: readonly PersonRef[];
}

export type ReplyTo =
  | {
      readonly deleted?: false;
      readonly id: string;
      readonly sequence: number;
      readonly author: PersonRef;
      readonly summary: string;
    }
  | { readonly deleted: true; readonly id: string; readonly sequence: number };

export type MemberEvent =
  | { readonly type: "created"; readonly by: Author }
  | {
      readonly type: "added";
      readonly by: Author;
      readonly people: readonly Author[];
      readonly othersCount?: number;
    }
  | { readonly type: "removed"; readonly by: Author; readonly people: readonly Author[] }
  | { readonly type: "joined"; readonly people: readonly Author[] }
  | { readonly type: "left"; readonly people: readonly Author[] }
  /** The first line of a pair; the app derives it, the queries do not return it. */
  | { readonly type: "start"; readonly people: readonly Author[] };

interface MessageBase {
  readonly id: string;
  readonly sequence: number;
  readonly createdAt: number;
}

/** What the sender sees before the server confirms a message. Not part of the query result. */
export type SendState = "sending" | "queued" | "failed";

export interface PostView extends MessageBase {
  readonly kind: "post";
  readonly author: Author;
  readonly body: string;
  readonly attachmentLabels?: readonly { readonly id: string; readonly label: string }[];
  /** First names that `@Name` highlights in the body. */
  readonly mentions: readonly string[];
  readonly attachments: readonly Attachment[];
  readonly replyTo: ReplyTo | null;
  readonly reactions: readonly Reaction[];
  readonly editedAt: number | null;
  readonly sendState?: SendState;
}

export interface DeletedView extends MessageBase {
  readonly kind: "deleted";
  readonly author: Author;
}

export interface EventView extends MessageBase {
  readonly kind: "event";
  readonly event: MemberEvent;
}

export type MessageView = PostView | DeletedView | EventView;

// ---------- messages.search ----------

export interface SearchHit {
  readonly groupId: string;
  readonly groupTitle: string;
  readonly groupAvatar: Avatar;
  readonly sequence: number;
  readonly author: Author;
  readonly createdAt: number;
  readonly snippet: string;
}

// ---------- people.find ----------

export interface PersonMatch extends Author {
  readonly fullName: string;
  readonly email: string | null;
}

// ---------- profiles.me ----------

export interface Me {
  readonly displayName: string;
  readonly email: string;
  readonly avatar: Avatar;
  /** "Google", "Apple" or "Email code". */
  readonly provider: string;
}
