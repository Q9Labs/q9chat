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

const PendingText = Schema.Struct({
  clientKey: Schema.String,
  attachment: Schema.optional(LocalAttachment),
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
