import { v, type Infer } from "convex/values";

import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import type { attachmentValidator } from "../schema";
import { fail } from "./access";
import type { uploadAttachment } from "./validators";
export const MAX_BYTES = 20 * 1024 * 1024;
export const imageTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
]);
export const voiceTypes = new Set([
  "audio/aac",
  "audio/mp4",
  "audio/x-m4a",
  "audio/webm",
  "audio/ogg",
]);
export function validContentType(type: string) {
  return (
    /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/iu.test(type) &&
    (!type.startsWith("image/") || imageTypes.has(type)) &&
    (!type.startsWith("audio/") || voiceTypes.has(type))
  );
}
export async function consume(ctx: MutationCtx, ownerId: Id<"profiles">, uploadId: Id<"uploads">) {
  const upload = await ctx.db.get(uploadId);
  if (!upload || upload.ownerId !== ownerId || upload.size > MAX_BYTES || upload.size <= 0)
    return fail("bad_attachment");
  await ctx.db.delete(upload._id);
  return upload;
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
    const upload = await consume(ctx, ownerId, item.uploadId);
    const base = {
      storageId: upload.storageId,
      contentType: upload.contentType,
      size: upload.size,
    };
    switch (item.kind) {
      case "image":
        if (
          !imageTypes.has(upload.contentType) ||
          !Number.isFinite(item.width) ||
          !Number.isFinite(item.height) ||
          item.width <= 0 ||
          item.height <= 0
        )
          return fail("bad_attachment");
        result.push({ ...base, kind: "image", width: item.width, height: item.height });
        break;
      case "file":
        if (!item.name.trim() || item.name.length > 200) return fail("bad_attachment");
        result.push({ ...base, kind: "file", name: item.name });
        break;
      case "voice":
        if (
          body !== "" ||
          input.length !== 1 ||
          !voiceTypes.has(upload.contentType) ||
          !Number.isFinite(item.durationMs) ||
          item.durationMs <= 0 ||
          item.durationMs > 600000 ||
          item.waveform.length > 64 ||
          item.waveform.some((sample) => !Number.isFinite(sample) || sample < 0 || sample > 1)
        )
          return fail("bad_attachment");
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
});
