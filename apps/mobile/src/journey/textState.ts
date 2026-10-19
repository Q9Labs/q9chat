import type { Id } from "@q9chat/convex";
import { Schema } from "effect";

const LocalAttachment = Schema.Union(
  Schema.Struct({
    kind: Schema.Literal("image"),
    uri: Schema.String,
    contentType: Schema.String,
    size: Schema.Number,
    width: Schema.Number,
    height: Schema.Number,
  }),
  Schema.Struct({
    kind: Schema.Literal("file"),
    uri: Schema.String,
    contentType: Schema.String,
    size: Schema.Number,
    name: Schema.String,
  }),
  Schema.Struct({
    kind: Schema.Literal("voice"),
    uri: Schema.String,
    contentType: Schema.String,
    size: Schema.Number,
    durationMs: Schema.Number,
    waveform: Schema.Array(Schema.Number),
  }),
);
export type LocalAttachment = typeof LocalAttachment.Type;

const Reply = Schema.Struct({
  messageId: Schema.String.pipe(
    Schema.filter((id): id is Id<"messages"> => /^[a-z0-9]{32}$/u.test(id)),
  ),
  sequence: Schema.Number,
  author: Schema.String,
  summary: Schema.String,
});
export type Reply = typeof Reply.Type;
const PendingText = Schema.Struct({
  clientKey: Schema.String,
  attachment: Schema.optional(LocalAttachment),
  reply: Schema.optional(Reply),
  body: Schema.String,
  createdAt: Schema.Number,
  status: Schema.Literal("sending", "failed"),
});
export const SavedText = Schema.Struct({
  draft: Schema.String,
  pending: Schema.Array(PendingText),
});
export type Pending = typeof PendingText.Type;
export type TextState = typeof SavedText.Type;
export const normalizeText = (body: string) => body.replace(/\s+$/u, "");
export function restoreText(text: TextState): TextState {
  return { ...text, pending: text.pending.map((post) => ({ ...post, status: "failed" })) };
}
