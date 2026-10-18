export const CODE_LENGTH = 6;

/** Stable React keys for the six cells that draw the code. */
export const CELL_IDS = ["first", "second", "third", "fourth", "fifth", "sixth"] as const;

export const isComplete = (code: string) => code.length === CODE_LENGTH;

/** The field's selection before the edit, in UTF-16 units: the part of `previous` the edit replaced. */
export type Selection = { start: number; end: number };

const digitsOf = (text: string) => text.replace(/\D/gu, "");

/**
 * The code after the field reports `text` while holding `previous` with `selection` selected. The edit
 * replaced that selection, so the inserted run is what sits between the unchanged start and end of
 * `previous`. A whole code in that run is the new code; shorter runs are typing, joined to the digits
 * around them. Only digits count and the code is six long.
 */
export function readCode(previous: string, text: string, selection: Selection): string {
  const before = previous.slice(0, selection.start);
  const after = previous.slice(selection.end);
  const insertedLength = text.length - before.length - after.length;
  if (insertedLength < 0 || !text.startsWith(before) || !text.endsWith(after))
    // A delete, or a selection that no longer matches the text: the field's own text is the answer.
    return digitsOf(text).slice(0, CODE_LENGTH);
  const inserted = digitsOf(text.slice(before.length, before.length + insertedLength));
  if (inserted.length >= CODE_LENGTH) return inserted.slice(0, CODE_LENGTH);
  return digitsOf(before + inserted + after).slice(0, CODE_LENGTH);
}
