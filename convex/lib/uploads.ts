import { v, type Infer } from "convex/values";

import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import type { attachmentValidator } from "../schema";
import { fail } from "./access";
import type { uploadAttachment } from "./validators";
export const MAX_BYTES = 20_000_000;
export const imageTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
export const voiceTypes = new Set([
  "audio/aac",
  "audio/mp4",
  "audio/x-m4a",
  "audio/webm",
  "audio/ogg",
]);
export async function consume(
  ctx: MutationCtx,
  ownerId: Id<"profiles">,
  uploadId: Id<"uploads">,
  kind: "image" | "file" | "voice",
) {
  const upload = await ctx.db.get(uploadId);
  if (
    !upload ||
    upload.ownerId !== ownerId ||
    upload.kind !== kind ||
    upload.size > MAX_BYTES ||
    upload.size <= 0
  )
    return fail("bad_attachment");
  await ctx.db.delete(upload._id);
  return upload;
}
type UploadInput = Infer<typeof uploadAttachment>;
function validateImage(item: Extract<UploadInput, { kind: "image" }>, contentType: string) {
  if (
    !imageTypes.has(contentType) ||
    !Number.isInteger(item.width) ||
    !Number.isInteger(item.height) ||
    item.width <= 0 ||
    item.height <= 0 ||
    item.width > 8000 ||
    item.height > 8000
  )
    fail("bad_attachment");
}
function validateVoice(
  item: Extract<UploadInput, { kind: "voice" }>,
  contentType: string,
  body: string,
  count: number,
) {
  if (
    body !== "" ||
    count !== 1 ||
    !voiceTypes.has(contentType) ||
    !Number.isFinite(item.durationMs) ||
    item.durationMs <= 0 ||
    item.durationMs > 600000 ||
    item.waveform.length > 64 ||
    item.waveform.some((sample) => !Number.isFinite(sample) || sample < 0 || sample > 1)
  )
    fail("bad_attachment");
}
export async function attachments(
  ctx: MutationCtx,
  ownerId: Id<"profiles">,
  body: string,
  input: Infer<typeof uploadAttachment>[],
): Promise<Infer<typeof attachmentValidator>[]> {
  if (input.length > 10 || (!body.trim() && input.length === 0)) return fail("bad_attachment");
  const result: Infer<typeof attachmentValidator>[] = [];
  for (const item of input) {
    const upload = await consume(ctx, ownerId, item.uploadId, item.kind);
    const base = {
      storageId: upload.storageId,
      contentType: upload.contentType,
      size: upload.size,
    };
    switch (item.kind) {
      case "image":
        validateImage(item, upload.contentType);
        result.push({ ...base, kind: "image", width: item.width, height: item.height });
        break;
      case "file":
        if (!item.name.trim() || item.name.length > 200) return fail("bad_attachment");
        result.push({ ...base, kind: "file", name: item.name });
        break;
      case "voice":
        validateVoice(item, upload.contentType, body, input.length);
        result.push({
          ...base,
          kind: "voice",
          durationMs: item.durationMs,
          waveform: item.waveform,
        });
        break;
    }
  }
  return result;
}
export const storedUpload = v.object({
  ownerId: v.id("profiles"),
  storageId: v.id("_storage"),
  contentType: v.string(),
  size: v.number(),
  kind: v.union(v.literal("image"), v.literal("file"), v.literal("voice")),
});
