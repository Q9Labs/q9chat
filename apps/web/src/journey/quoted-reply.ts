import { api } from "@q9chat/convex";
import type { Id } from "@q9chat/convex";
import type { ConvexReactClient } from "convex/react";

import type { QuotedReply } from "./text-storage.js";
export type { QuotedReply } from "./text-storage.js";

export async function replyId(
  client: ConvexReactClient,
  groupId: Id<"groups">,
  reply: QuotedReply,
) {
  const rows = await client.query(api.messages.range, {
    groupId,
    fromSequence: reply.sequence,
    toSequence: reply.sequence,
  });
  const original = rows.find((row) => row.id === reply.id && row.kind !== "event");
  if (!original) throw new Error("The quoted message is no longer available.");
  return original.id;
}
