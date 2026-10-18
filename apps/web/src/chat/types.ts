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

/** A person as shown in a group. `name` is the first word of the display name. */
export interface Author {
  readonly id: string;
  readonly name: string;
  readonly avatar: Avatar;
  readonly isYou: boolean;
}

export interface Member extends Author {
  readonly fullName: string;
  readonly email: string;
}

// ---------- groups.list ----------

export interface Preview {
  /** "you", a first name, or null for an event sentence. */
  readonly by: "you" | string | null;
  readonly summary: string;
}

export interface GroupRow {
  readonly groupId: string;
  readonly kind: "group" | "pair";
  readonly title: string;
  readonly avatar: Avatar;
  readonly lastActivityAt: number;
  readonly preview: Preview;
  readonly unreadCount: number;
  readonly needsYou: boolean;
  readonly notify: NotifyMode;
}

export interface RemovedRow {
  readonly groupId: string;
  readonly kind: "group" | "pair";
  readonly title: string;
  readonly avatar: Avatar;
  readonly removedBy: string;
  readonly removedAt: number;
}

export type GroupListRow = GroupRow | RemovedRow;

export function isRemovedRow(row: GroupListRow): row is RemovedRow {
  return "removedBy" in row;
}

// ---------- groups.get ----------

export interface GroupDetail {
  readonly status: "member";
  readonly groupId: string;
  readonly kind: "group" | "pair";
  readonly title: string;
  readonly avatar: Avatar;
  readonly memberCount: number;
  readonly members: readonly Member[];
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
  /** Display labels of the reactors in order, "You" first when mine. */
  readonly names: readonly string[];
}

export interface ReplyTo {
  readonly id: string;
  readonly sequence: number;
  readonly author: Author;
  readonly summary: string;
  readonly deleted: boolean;
}

export type MemberEvent =
  | { readonly type: "created"; readonly by: Author }
  | { readonly type: "added"; readonly by: Author; readonly people: readonly Author[] }
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

export interface PersonMatch {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly avatar: Avatar;
}

// ---------- profiles.me ----------

export interface Me {
  readonly displayName: string;
  readonly email: string;
  readonly avatar: Avatar;
  /** "Google", "Apple" or "Email code". */
  readonly provider: string;
}
