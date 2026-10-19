import { Schema } from "effect";

const PendingText = Schema.Struct({
  clientKey: Schema.String,
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
