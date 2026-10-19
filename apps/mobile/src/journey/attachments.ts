import type { Id, api } from "@q9chat/convex";
import type { FunctionArgs } from "convex/server";
import { Schema } from "effect";
import * as DocumentPicker from "expo-document-picker";
import { File, Paths } from "expo-file-system";
import * as ImagePicker from "expo-image-picker";

import { config } from "../session/config";
import type { LocalAttachment } from "./textState";

const MAX_BYTES = 20_000_000;
const UploadResponse = Schema.Struct({
  uploadId: Schema.String.pipe(
    Schema.filter((id): id is Id<"uploads"> => /^[a-z0-9]{32}$/u.test(id)),
  ),
});

async function pickFile(): Promise<LocalAttachment | null> {
  const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
  const asset = result.canceled ? null : result.assets[0];
  return asset
    ? {
        kind: "file",
        uri: asset.uri,
        name: asset.name,
        contentType: asset.mimeType ?? "application/octet-stream",
        size: asset.size ?? new File(asset.uri).size,
      }
    : null;
}
async function pickPhoto(): Promise<LocalAttachment | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    quality: 1,
    preferredAssetRepresentationMode:
      ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
  });
  const asset = result.canceled ? null : result.assets[0];
  if (!asset) return null;
  const contentType = asset.mimeType ?? "image/jpeg";
  validatePhoto(contentType, asset.width, asset.height);
  return {
    kind: "image",
    uri: asset.uri,
    contentType,
    size: asset.fileSize ?? new File(asset.uri).size,
    width: asset.width,
    height: asset.height,
  };
}

function validatePhoto(contentType: string, width: number, height: number) {
  if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(contentType))
    throw new Error("Choose a JPEG, PNG, GIF or WebP photo.");
  if (width > 8000 || height > 8000)
    throw new Error("Choose a photo no larger than 8,000 pixels on either side.");
}
export function pickAttachment(kind: "image" | "file") {
  return kind === "file" ? pickFile() : pickPhoto();
}

/** Keep a private durable copy before the picker or recorder's temporary file disappears. */
export function keepAttachment(attachment: LocalAttachment, key: string): LocalAttachment {
  const source = new File(attachment.uri);
  if (source.size <= 0 || source.size > MAX_BYTES)
    throw new Error("Choose a file between 1 byte and 20 MB.");
  const file = new File(Paths.document, `q9-attachment-${key}`);
  source.copySync(file);
  return { ...attachment, uri: file.uri, size: file.size };
}

export async function uploadAttachment(
  attachment: LocalAttachment,
  token: string,
  signal: AbortSignal,
): Promise<FunctionArgs<typeof api.messages.send>["attachments"][number]> {
  const response = await fetch(`${config.siteUrl}/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": attachment.contentType },
    body: await new File(attachment.uri).bytes(),
    signal,
  });
  if (!response.ok) throw new Error("Couldn't upload. Try again.");
  const { uploadId } = Schema.decodeUnknownSync(UploadResponse)(await response.json());
  if (attachment.kind === "image")
    return { kind: "image", uploadId, width: attachment.width, height: attachment.height };
  if (attachment.kind === "file") return { kind: "file", uploadId, name: attachment.name };
  return {
    kind: "voice",
    uploadId,
    durationMs: attachment.durationMs,
    waveform: [...attachment.waveform],
  };
}
