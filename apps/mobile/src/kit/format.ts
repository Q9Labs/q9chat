export const formatDuration = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

/** Stable React keys for a list that never reorders: each item is keyed by where it starts (its summed size so far). */
export function keyedByOffset<Item>(
  items: readonly Item[],
  sizeOf: (item: Item) => number,
): { key: number; item: Item }[] {
  let at = 0;
  return items.map((item) => {
    const key = at;
    at += sizeOf(item);
    return { key, item };
  });
}

/** Only http and https links open from a message; anything else stays plain text. */
export const isWebUrl = (text: string) => /^https?:\/\/\S+$/i.test(text);

// Hermes may not ship Intl.Segmenter; then code points are the next best unit.
const segmenter = typeof Intl !== "undefined" && "Segmenter" in Intl ? new Intl.Segmenter() : null;

/** `text` cut to `max` characters with an ellipsis, never inside an emoji or an accented letter. */
export function truncate(text: string, max: number): string {
  const units = segmenter
    ? Array.from(segmenter.segment(text), (part) => part.segment)
    : Array.from(text);
  return units.length > max ? `${units.slice(0, max - 1).join("")}…` : text;
}
