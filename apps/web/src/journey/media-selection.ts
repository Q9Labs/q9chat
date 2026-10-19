import type { Media } from "./media-storage.js";

function validateFile(file: File, kind: "photo" | "file") {
  if (!file.size) throw new Error("That file is empty. Choose another.");
  if (file.size > 20_000_000) throw new Error("That file is over 20 MB. Choose a smaller one.");
  if ((kind === "file" && !file.name.trim()) || file.name.length > 200)
    throw new Error("Use a filename of 200 characters or fewer.");
}
async function prefix(file: File) {
  return new Uint8Array(
    await file
      .slice(0, 16)
      .arrayBuffer()
      .catch(() => {
        throw new Error("Couldn't read that attachment. Choose another.");
      }),
  );
}
function supportedPhoto(bytes: Uint8Array) {
  const begins = (signature: readonly number[]) =>
    signature.every((byte, index) => bytes[index] === byte);
  return (
    begins([0xff, 0xd8, 0xff]) ||
    begins([0x89, 0x50, 0x4e, 0x47]) ||
    String.fromCharCode(...bytes.slice(0, 6)).startsWith("GIF8") ||
    (String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
      String.fromCharCode(...bytes.slice(8, 12)) === "WEBP")
  );
}
async function photo(file: File): Promise<Media> {
  if (!supportedPhoto(await prefix(file)))
    throw new Error("Choose a JPEG, PNG, WebP or GIF photo. Use File for other formats.");
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error("Couldn't open that photo. Choose another or send it as a file.");
  });
  try {
    if (Math.min(bitmap.width, bitmap.height) < 1 || Math.max(bitmap.width, bitmap.height) > 8000)
      throw new Error("Choose a photo no larger than 8,000 pixels on either side.");
    return { kind: "image", blob: file, width: bitmap.width, height: bitmap.height };
  } finally {
    bitmap.close();
  }
}
async function genericFile(file: File): Promise<Media> {
  // A bounded read detects unreadable files without buffering a complete upload.
  await prefix(file);
  return { kind: "file", blob: file, name: file.name };
}
export async function selectedMedia(
  files: readonly File[],
  kind: "photo" | "file",
): Promise<readonly Media[]> {
  if (!files.length || files.length > 10) throw new Error("Choose one to ten attachments.");
  for (const file of files) validateFile(file, kind);
  const selected: Media[] = [];
  for (const file of files) {
    // eslint-disable-next-line react-doctor/async-await-in-loop -- Serial decoding is intentional because concurrent phone photos can exhaust tab memory.
    selected.push(await (kind === "file" ? genericFile(file) : photo(file)));
  }
  return selected;
}
