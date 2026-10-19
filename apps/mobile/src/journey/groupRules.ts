import { ConvexError } from "convex/values";

/** A call to the server from a screen: not started, out, or answered with a reason it failed. */
export type Phase = { kind: "idle" } | { kind: "pending" } | { kind: "failed"; message: string };

/** One `addMembers` call adds at most this many people. */
const ADD_LIMIT = 50;

export const removedInviteCopy = "You were removed from this group. Ask a member to add you back.";
export const invalidInviteCopy = "This invite link isn't valid.";
const GENERIC = "Couldn't complete that. Try again.";

/** Add mode refuses the 51st person; creating a group has no per-call cap here. */
export function pickerLimit(mode: "create" | "add", count: number): string | null {
  return mode === "add" && count > ADD_LIMIT ? "Add up to 50 people at a time." : null;
}

/** Picking `person` into `chosen`: the next list, or the reason it cannot be added (the list stays as it was). */
export function pickInto<Person>(
  mode: "create" | "add",
  chosen: readonly Person[],
  person: Person,
): { people: readonly Person[]; limit: string | null } {
  const limit = pickerLimit(mode, chosen.length + 1);
  return limit ? { people: chosen, limit } : { people: [...chosen, person], limit: null };
}

/** The matches to suggest: not anyone already picked, and not anyone already in the group. */
export function offered<Found extends { id: string }>(
  matches: readonly Found[] | undefined,
  picked: readonly { id: string }[],
  members: readonly string[],
): Found[] {
  const taken = new Set([...picked.map((person) => person.id), ...members]);
  return (matches ?? []).filter((match) => !taken.has(match.id));
}

/** A pair can be opened with someone else who still has an account. */
export const canMessage = (member: { deleted: boolean; isYou: boolean }) =>
  !member.deleted && !member.isYou;

/** What `groups.get` says once Group info is open: it closes when the group is gone, or no longer yours. */
export const membershipLost = (detail: { status: string } | null | undefined) =>
  detail !== undefined && detail?.status !== "member";

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

type Match = { id: string };

/** The people field takes this many characters to search with. */
export const MAX_QUERY = 100;

/** What a typed search says about itself, if anything. */
function typedHint(typed: string, ownEmail: string, matches: readonly Match[] | undefined) {
  if (typed.length > MAX_QUERY) return { kind: "tooLong" } as const;
  if (typed.toLowerCase() === ownEmail.toLowerCase()) return { kind: "you" } as const;
  if (EMAIL_SHAPE.test(typed) && matches?.length === 0)
    return { kind: "noAccount", email: typed } as const;
  return null;
}

/**
 * What the people field says under it: an explanation while it is empty, "That's you." for your own
 * address, that a long search is too long, or that an address has no account.
 */
export function pickerHint(
  query: string,
  ownEmail: string,
  matches: readonly Match[] | undefined,
  chosen: number,
) {
  const typed = query.trim();
  return (
    typedHint(typed, ownEmail, matches) ??
    (typed === "" && chosen === 0 ? ({ kind: "explain" } as const) : null)
  );
}

/** The one person a name-less form would start a pair with, else null. */
export function pairCandidate<Id extends string>(
  name: string,
  people: readonly { id: Id }[],
): Id | null {
  return name.trim() === "" && people.length === 1 ? (people[0]?.id ?? null) : null;
}

function errorCode(error: unknown): string | null {
  if (!(error instanceof ConvexError)) return null;
  const data: unknown = error.data;
  if (typeof data !== "object" || data === null || !("code" in data)) return null;
  return typeof data.code === "string" ? data.code : null;
}

const ERROR_COPY = new Map([
  ["name_required", "Enter a group name or add someone."],
  ["name_too_long", "Use a group name of 80 characters or fewer."],
  ["group_full", "This group is full. A group can have up to 100 people."],
  ["too_many_groups", "You're in 100 groups already. Leave one to make another."],
  ["pair_locked", "You can't add people to a group of two. Create a new group instead."],
  ["invite_invalid", invalidInviteCopy],
  ["removed_from_group", removedInviteCopy],
  ["not_member", "You no longer have access to this group."],
  ["account_unavailable", "This account isn't available. Try signing in again."],
]);

/** The server can't say whose limit it was, so with people picked the copy covers both. */
const PICKED_COPY = new Map([
  [
    "too_many_groups",
    "You or someone you picked is already in 100 groups. Remove people, or leave a group.",
  ],
  [
    "account_unavailable",
    "You or someone you picked isn't available. Remove people, or sign in again.",
  ],
]);

/** Plain words for a failed group call; `pickedPeople` is how many people were chosen for it. */
export function groupError(error: unknown, pickedPeople = 0): string {
  const code = errorCode(error);
  if (code === null) return GENERIC;
  const picked = pickedPeople > 0 ? PICKED_COPY.get(code) : undefined;
  return picked ?? ERROR_COPY.get(code) ?? GENERIC;
}

const BASE62 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/** A 16-character base62 token; bytes of 248 and up are skipped so every character is equally likely. */
export function newInviteToken(randomBytes: (length: number) => Uint8Array): string {
  let token = "";
  while (token.length < 16)
    for (const byte of randomBytes(24))
      if (byte < 248 && token.length < 16) token += BASE62[byte % 62];
  return token;
}
