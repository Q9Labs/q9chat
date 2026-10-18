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
    await targetActive(ctx, profileId);
    if (current.some((row) => row.profileId === profileId)) continue;
    const groups = await ctx.db
      .query("memberships")
      .withIndex("by_profile", (q) => q.eq("profileId", profileId))
      .take(200);
    if (groups.length >= 200 || current.length + added.length >= 100) return fail("bad_attachment");
    await ctx.db.insert("memberships", {
      groupId,
      profileId,
      notify: "mentions",
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
  const unread = await ctx.db
    .query("unreadPosts")
    .withIndex("by_profile_group_sequence", (q) =>
      q.eq("profileId", profileId).eq("groupId", groupId),
    )
    .collect();
  for (const post of unread) await ctx.db.delete(post._id);
  const typing = await ctx.db
    .query("typing")
    .withIndex("by_group_profile", (q) => q.eq("groupId", groupId).eq("profileId", profileId))
    .unique();
  if (typing) await ctx.db.delete(typing._id);
}
export const pairKey = (a: Id<"profiles">, b: Id<"profiles">) => [a, b].toSorted().join(":");
