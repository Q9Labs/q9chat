/** A route can only request a positive, safe message sequence. */
export function searchSequence(value: string | undefined): number | null {
  if (!value || !/^[1-9]\d*$/u.test(value)) return null;
  const sequence = Number(value);
  return Number.isSafeInteger(sequence) ? sequence : null;
}

/** Emphasize the first matching word in a display-ready search snippet. */
export function splitSearchSnippet(snippet: string, query: string) {
  const word = query.trim().split(/\s+/u).at(-1) ?? "";
  const start = word ? snippet.toLowerCase().indexOf(word.toLowerCase()) : -1;
  if (start < 0) return { before: snippet, match: "", after: "" };
  return {
    before: snippet.slice(0, start),
    match: snippet.slice(start, start + word.length),
    after: snippet.slice(start + word.length),
  };
}
