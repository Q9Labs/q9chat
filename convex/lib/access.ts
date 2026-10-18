import type { ErrorCode } from "@q9chat/domain";
import type { Auth, UserIdentity } from "convex/server";
import { ConvexError } from "convex/values";

import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx, MutationCtx, ActionCtx } from "../_generated/server";
export const fail = (code: ErrorCode): never => {
  throw new ConvexError({ code });
};
type AuthCtx = { auth: Auth };
type DbCtx = QueryCtx | MutationCtx;
export async function anyone(ctx: AuthCtx) {
  return ctx.auth.getUserIdentity();
}
async function availableIdentity(ctx: AuthCtx) {
  const value = await ctx.auth.getUserIdentity();
  if (!value) return fail("account_unavailable");
  return value;
}
export async function identity(ctx: ActionCtx): Promise<UserIdentity> {
  const value = await availableIdentity(ctx);
  const profile = await ctx.runQuery(internal.profiles.byAuth, { authUserId: value.subject });
  if (profile && profile.status !== "active") return fail("account_unavailable");
  return value;
}
export async function active(ctx: DbCtx): Promise<Doc<"profiles"> & { status: "active" }> {
  const value = await availableIdentity(ctx);
  const profile = await ctx.db
    .query("profiles")
    .withIndex("by_auth_user", (q) => q.eq("authUserId", value.subject))
    .unique();
  if (!profile || profile.status !== "active") return fail("account_unavailable");
  return profile;
}
type Target = { groupId: Id<"groups">; removalNotice?: boolean } | { messageId: Id<"messages"> };
export async function member(ctx: DbCtx, target: Target) {
  const profile = await active(ctx);
  const message = "messageId" in target ? await ctx.db.get(target.messageId) : null;
  const groupId = "groupId" in target ? target.groupId : message?.groupId;
  if (!groupId) return fail("not_member");
  const membership = await ctx.db
    .query("memberships")
    .withIndex("by_group_profile", (q) => q.eq("groupId", groupId).eq("profileId", profile._id))
    .unique();
  if (!membership && !("removalNotice" in target && target.removalNotice))
    return fail("not_member");
  return { profile, membership, groupId, message };
}
