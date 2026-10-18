export type Sniffed = { kind: "image" | "file" | "voice"; contentType: string };
export function sniff(bytes: Uint8Array): Sniffed {
  const text = (offset: number, length: number) =>
    String.fromCharCode(...bytes.slice(offset, offset + length));
  const prefix = text(0, Math.min(bytes.length, 65536));
  const starts = (...signature: number[]) =>
    signature.every((byte, index) => bytes[index] === byte);
  if (starts(0xff, 0xd8, 0xff)) return { kind: "image", contentType: "image/jpeg" };
  if (starts(137, 80, 78, 71, 13, 10, 26, 10)) return { kind: "image", contentType: "image/png" };
  if (["GIF87a", "GIF89a"].includes(text(0, 6))) return { kind: "image", contentType: "image/gif" };
  if (text(0, 4) === "RIFF" && text(8, 4) === "WEBP")
    return { kind: "image", contentType: "image/webp" };
  if (text(4, 4) === "ftyp") {
    const brands = text(8, Math.min(bytes.length - 8, 64));
    if (/heic|heix|hevc|hevx|mif1|msf1/u.test(brands))
      return { kind: "image", contentType: "image/heic" };
  }
  const voice = voiceType(prefix, starts);
  if (voice) return voice;
  if (text(0, 5) === "%PDF-") return { kind: "file", contentType: "application/pdf" };
  return { kind: "file", contentType: "application/octet-stream" };
}

const audioTrack = (prefix: string, audio: string, video: string) =>
  prefix.includes(audio) && !prefix.includes(video);
function voiceType(prefix: string, starts: (...signature: number[]) => boolean): Sniffed | null {
  if (
    prefix.slice(4, 8) === "ftyp" &&
    /M4A |M4B /u.test(prefix.slice(8, 72)) &&
    audioTrack(prefix, "mp4a", "vide")
  )
    return { kind: "voice", contentType: "audio/mp4" };
  if (prefix.startsWith("OggS") && audioTrack(prefix, "OpusHead", "theora"))
    return { kind: "voice", contentType: "audio/ogg" };
  if (
    starts(0x1a, 0x45, 0xdf, 0xa3) &&
    prefix.includes("webm") &&
    audioTrack(prefix, "A_OPUS", "V_")
  )
    return { kind: "voice", contentType: "audio/webm" };
  return null;
}
