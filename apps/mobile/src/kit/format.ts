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

const ZERO_WIDTH_JOINER = 0x200d;
const COMBINING_RANGES = [
  [0x300, 0x36f],
  [0x1ab0, 0x1aff],
  [0x1dc0, 0x1dff],
  [0x20d0, 0x20ff],
  [0xfe00, 0xfe0f],
  [0xfe20, 0xfe2f],
  [0x1f3fb, 0x1f3ff],
  [0xe0020, 0xe007f],
] as const;
const inRanges = (point: number, ranges: readonly (readonly [number, number])[]) =>
  ranges.some(([low, high]) => point >= low && point <= high);
const isRegionalIndicator = (point: number) => point >= 0x1f1e6 && point <= 0x1f1ff;

const continuesCluster = (point: number, joined: boolean, flagHalf: boolean): boolean =>
  joined ||
  point === ZERO_WIDTH_JOINER ||
  inRanges(point, COMBINING_RANGES) ||
  (flagHalf && isRegionalIndicator(point));

/**
 * Hermes has no Intl.Segmenter, so this groups code points the way a reader sees characters: a base with its
 * combining marks, variation selectors and skin tones, joiner sequences such as a family emoji, and flag pairs.
 */
export function characterClusters(text: string): string[] {
  const clusters: string[] = [];
  let joined = false;
  let flagHalf = false;
  for (const char of text) {
    const point = char.codePointAt(0) ?? 0;
    const attaches: boolean = clusters.length > 0 && continuesCluster(point, joined, flagHalf);
    if (attaches) clusters[clusters.length - 1] += char;
    else clusters.push(char);
    joined = point === ZERO_WIDTH_JOINER;
    flagHalf = isRegionalIndicator(point) && !(attaches && flagHalf);
  }
  return clusters;
}

const segmenter = typeof Intl !== "undefined" && "Segmenter" in Intl ? new Intl.Segmenter() : null;

/** `text` cut to `max` characters with an ellipsis, never inside an emoji or an accented letter. */
export function truncate(text: string, max: number): string {
  const units = segmenter
    ? Array.from(segmenter.segment(text), (part) => part.segment)
    : characterClusters(text);
  return units.length > max ? `${units.slice(0, max - 1).join("")}…` : text;
}
