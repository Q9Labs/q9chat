import { ConvexError } from "convex/values";

export const removedInviteCopy = "You were removed from this group. Ask a member to add you back.";
export const invalidInviteCopy = "This invite link isn't valid.";

const errorCopy = new Map([
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
function errorCode(error: unknown): string | null {
  if (!(error instanceof ConvexError)) return null;
  const data: unknown = error.data;
  if (typeof data !== "object" || data === null || !("code" in data)) return null;
  return typeof data.code === "string" ? data.code : null;
}
const pickedErrorCopy = new Map([
  ["too_many_groups", "You or someone you picked is already in 100 groups."],
  ["account_unavailable", "Someone you picked is no longer available. Remove them to continue."],
]);
export function journeyError(error: unknown, pickedPeople = 0): string {
  const code = errorCode(error);
  if (code === null) return "Couldn't complete that. Try again.";
  const picked = pickedPeople > 0 ? pickedErrorCopy.get(code) : undefined;
  return picked ?? errorCopy.get(code) ?? "Couldn't complete that. Try again.";
}
