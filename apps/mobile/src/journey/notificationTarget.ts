import { Either, Schema } from "effect";

import { searchSequence } from "./searchRules.ts";

const PushData = Schema.Struct({ url: Schema.String });

/** Accept only this app's group/message routes, never arbitrary links from a push. */
export function notificationTarget(data: unknown) {
  const parsed = Schema.decodeUnknownEither(PushData)(data);
  if (Either.isLeft(parsed)) return null;
  const path = parsed.right.url.replace(/^q9chat:\/\//u, "/");
  const match = /^\/g\/([a-z0-9]+)\?m=([1-9]\d*)$/u.exec(path);
  const groupId = match?.[1];
  const sequence = searchSequence(match?.[2]);
  return groupId && sequence !== null ? { groupId, m: String(sequence) } : null;
}

export function showPhoneNotification(data: unknown, viewingPath: string | null) {
  const target = notificationTarget(data);
  return target !== null && viewingPath !== `/g/${target.groupId}`;
}
