import type { Id } from "@q9chat/convex";
import { ConvexError } from "convex/values";
import { Schema } from "effect";
import * as ImagePicker from "expo-image-picker";

import { config } from "../session/config";
import { photoRejectedNotice, photoTooLarge, photoTooLargeNotice } from "./photoRules";

/** Image types the backend shows; a HEIC upload would be a file, not an image. */
const SUPPORTED_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

export type PickedPhoto = { uri: string; mimeType: string };

class PhotoRejectedError extends Error {}

export function isPhotoRejection(error: unknown) {
  return (
    error instanceof PhotoRejectedError ||
    (error instanceof ConvexError &&
      Schema.is(Schema.Struct({ code: Schema.Literal("bad_attachment") }))(error.data))
  );
}

/** What the picker returned: a photo to use, a notice to show, or nothing when the person cancelled. */
export type PickResult =
  | { kind: "picked"; photo: PickedPhoto }
  | { kind: "refused"; notice: string }
  | { kind: "cancelled" };

/** Opens the photo library. iOS hands over JPEG ("compatible"), never HEIC, which the backend would call a file. */
export async function pickPhoto(): Promise<PickResult> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsEditing: false,
    quality: 1,
    preferredAssetRepresentationMode:
      ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
  });
  const asset = result.canceled ? null : result.assets[0];
  if (!asset) return { kind: "cancelled" };
  const mimeType = asset.mimeType ?? "image/jpeg";
  if (!SUPPORTED_TYPES.has(mimeType)) return { kind: "refused", notice: photoRejectedNotice };
  if (asset.fileSize !== undefined && photoTooLarge(asset.fileSize))
    return { kind: "refused", notice: photoTooLargeNotice };
  return { kind: "picked", photo: { uri: asset.uri, mimeType } };
}

const UploadResponse = Schema.Struct({
  // Convex validates the table at profiles.update; check the encoded id at this HTTP boundary.
  uploadId: Schema.String.pipe(
    Schema.filter((id): id is Id<"uploads"> => /^[a-z0-9]{32}$/u.test(id)),
  ),
});

/** Sends the photo to the Convex HTTP route and returns the id `profiles.update` consumes. */
export async function uploadPhoto(photo: PickedPhoto, token: string | null) {
  if (!token) throw new Error("Sign in again to upload a photo.");
  const local = await fetch(photo.uri);
  if (!local.ok) throw new Error("Couldn't read your photo. Try again.");
  const bytes = await local.blob();
  if (photoTooLarge(bytes.size)) throw new PhotoRejectedError();
  const response = await fetch(`${config.siteUrl}/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": photo.mimeType },
    body: bytes,
  });
  if ([400, 413, 415].includes(response.status)) throw new PhotoRejectedError();
  if (!response.ok) throw new Error("Couldn't upload your photo. Try again.");
  return Schema.decodeUnknownSync(UploadResponse)(await response.json()).uploadId;
}
