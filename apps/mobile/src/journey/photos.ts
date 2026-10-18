import type { Id } from "@q9chat/convex";
import { ConvexError } from "convex/values";
import { Schema } from "effect";
import * as ImagePicker from "expo-image-picker";

import { config } from "../session/config";
import { photoRejectedNotice, photoTooLarge, photoTooLargeNotice } from "./photoRules";

/** Image types the backend shows; a HEIC upload would be a file, not an image. */
const SUPPORTED_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

export type PickedPhoto = { uri: string; mimeType: string };

/** A photo the person must replace; the message is the notice to show. */
class PhotoRejectedError extends Error {}

/** The notice for a photo the backend or the size check refused, or null for any other failure. */
export function photoNoticeOf(error: unknown): string | null {
  if (error instanceof PhotoRejectedError) return error.message;
  const unusable =
    error instanceof ConvexError &&
    Schema.is(Schema.Struct({ code: Schema.Literal("bad_attachment") }))(error.data);
  return unusable ? photoRejectedNotice : null;
}

/** What the picker returned: a photo to use, a notice to show, or nothing when the person cancelled. */
export type PickResult =
  | { kind: "picked"; photo: PickedPhoto }
  | { kind: "refused"; notice: string }
  | { kind: "cancelled" };

/** Opens the photo library. iOS hands over JPEG ("compatible"), never HEIC, which the backend would call a file. */
export async function pickPhoto(): Promise<PickResult> {
  let result: ImagePicker.ImagePickerResult;
  try {
    result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: false,
      quality: 1,
      preferredAssetRepresentationMode:
        ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
    });
  } catch {
    // The picker rejects when it cannot read the chosen photo.
    return { kind: "refused", notice: photoRejectedNotice };
  }
  const asset = result.canceled ? null : result.assets[0];
  return asset ? checkAsset(asset) : { kind: "cancelled" };
}

async function checkAsset(asset: ImagePicker.ImagePickerAsset): Promise<PickResult> {
  const mimeType = asset.mimeType ?? "image/jpeg";
  const size = SUPPORTED_TYPES.has(mimeType)
    ? (asset.fileSize ?? (await sizeOfFile(asset.uri)))
    : null;
  if (size === null) return { kind: "refused", notice: photoRejectedNotice };
  if (photoTooLarge(size)) return { kind: "refused", notice: photoTooLargeNotice };
  return { kind: "picked", photo: { uri: asset.uri, mimeType } };
}

/** The picker leaves `fileSize` out for some assets; the size then comes from reading the file, or null when it cannot be read. */
async function sizeOfFile(uri: string): Promise<number | null> {
  try {
    const response = await fetch(uri);
    return response.ok ? (await response.blob()).size : null;
  } catch {
    return null;
  }
}

const UploadResponse = Schema.Struct({
  // Convex validates the table at profiles.update; check the encoded id at this HTTP boundary.
  uploadId: Schema.String.pipe(
    Schema.filter((id): id is Id<"uploads"> => /^[a-z0-9]{32}$/u.test(id)),
  ),
});

/** The notice for an upload status that means the photo itself was refused. */
function refusalOf(status: number): string | null {
  if (status === 413) return photoTooLargeNotice;
  return status === 400 || status === 415 ? photoRejectedNotice : null;
}

/** Sends the photo to the Convex HTTP route and returns the id `profiles.update` consumes. */
export async function uploadPhoto(photo: PickedPhoto, token: string | null) {
  if (!token) throw new Error("Sign in again to upload a photo.");
  const local = await fetch(photo.uri);
  if (!local.ok) throw new Error("Couldn't read your photo. Try again.");
  const bytes = await local.blob();
  if (photoTooLarge(bytes.size)) throw new PhotoRejectedError(photoTooLargeNotice);
  const response = await fetch(`${config.siteUrl}/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": photo.mimeType },
    body: bytes,
  });
  const refusal = refusalOf(response.status);
  if (refusal) throw new PhotoRejectedError(refusal);
  if (!response.ok) throw new Error("Couldn't upload your photo. Try again.");
  return Schema.decodeUnknownSync(UploadResponse)(await response.json()).uploadId;
}
