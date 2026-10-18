import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
export async function lowerCount(ctx: MutationCtx, reaction: Doc<"reactions">) {
  const message = await ctx.db.get(reaction.messageId);
  if (message?.kind === "post") {
    await ctx.db.patch(message._id, {
      reactionCounts: message.reactionCounts
        .map((item) => (item.emoji === reaction.emoji ? { ...item, count: item.count - 1 } : item))
        .filter((item) => item.count > 0),
    });
  }
  await ctx.db.delete(reaction._id);
}
