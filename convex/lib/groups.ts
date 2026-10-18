import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { fail } from "./access";
export const memberships = (ctx: Pick<QueryCtx, "db">, groupId: Id<"groups">) =>
  ctx.db
    .query("memberships")
    .withIndex("by_group_profile", (q) => q.eq("groupId", groupId))
    .collect();
export const membership = (
  ctx: Pick<QueryCtx, "db">,
  groupId: Id<"groups">,
  profileId: Id<"profiles">,
) =>
  ctx.db
    .query("memberships")
    .withIndex("by_group_profile", (q) => q.eq("groupId", groupId).eq("profileId", profileId))
    .unique();
export const removal = (
  ctx: Pick<QueryCtx, "db">,
  groupId: Id<"groups">,
  profileId: Id<"profiles">,
) =>
  ctx.db
    .query("removals")
    .withIndex("by_group_profile", (q) => q.eq("groupId", groupId).eq("profileId", profileId))
    .unique();
export const readState = (
  ctx: Pick<QueryCtx, "db">,
  groupId: Id<"groups">,
  profileId: Id<"profiles">,
) =>
  ctx.db
    .query("readStates")
    .withIndex("by_group_profile", (q) => q.eq("groupId", groupId).eq("profileId", profileId))
    .unique();
export async function targetActive(ctx: Pick<QueryCtx, "db">, profileId: Id<"profiles">) {
  const value = await ctx.db.get(profileId);
  if (!value || value.status !== "active") return fail("account_unavailable");
  return value;
}
export async function event(
  ctx: MutationCtx,
  groupId: Id<"groups">,
  value: Extract<Doc<"messages">, { kind: "event" }>["event"],
) {
  const group = await ctx.db.get(groupId);
  if (!group) return fail("not_member");
  const sequence = group.lastSequence + 1;
  await ctx.db.patch(groupId, { lastSequence: sequence });
  await ctx.db.insert("messages", { kind: "event", groupId, sequence, event: value });
  return sequence;
}
export async function add(
  ctx: MutationCtx,
  groupId: Id<"groups">,
  profileIds: Id<"profiles">[],
  sequence: number,
) {
  const current = await memberships(ctx, groupId);
  const added = [];
  for (const profileId of new Set(profileIds)) {
    const profile = await targetActive(ctx, profileId);
    if (current.some((row) => row.profileId === profileId)) continue;
    const groups = await ctx.db
      .query("memberships")
      .withIndex("by_profile", (q) => q.eq("profileId", profileId))
      .take(100);
    if (groups.length >= 100) return fail("too_many_groups");
    if (current.length + added.length >= 100) return fail("group_full");
    await ctx.db.insert("memberships", {
      groupId,
      profileId,
      notify: "mentions",
      searchName: profile.displayName.toLowerCase(),
      joinedAt: Date.now(),
    });
    await ctx.db.insert("readStates", {
      groupId,
      profileId,
      lastReadSequence: sequence,
      lastNeedsYouSequence: 0,
    });
    const removed = await removal(ctx, groupId, profileId);
    if (removed) await ctx.db.delete(removed._id);
    added.push(profileId);
  }
  return added;
}
export async function clearMembership(
  ctx: MutationCtx,
  groupId: Id<"groups">,
  profileId: Id<"profiles">,
) {
  const row = await membership(ctx, groupId, profileId);
  if (row) await ctx.db.delete(row._id);
  const state = await readState(ctx, groupId, profileId);
  if (state) await ctx.db.delete(state._id);
  const group = await ctx.db.get(groupId);
  await ctx.scheduler.runAfter(0, internal.cleanup.unread, {
    profileId,
    groupId,
    cutoff: group?.lastSequence ?? 0,
  });
  const typing = await ctx.db
    .query("typing")
    .withIndex("by_group_profile", (q) => q.eq("groupId", groupId).eq("profileId", profileId))
    .unique();
  if (typing) await ctx.db.delete(typing._id);
}
export const pairKey = (a: Id<"profiles">, b: Id<"profiles">) => [a, b].toSorted().join(":");

export function validateInviteToken(token: string) {
  if (!/^[A-Za-z0-9]{16,32}$/u.test(token)) throw new Error("Invalid invite token");
}
