export const CODE_LENGTH = 6;

/** Stable React keys for the six cells. */
export const CELL_IDS = ["first", "second", "third", "fourth", "fifth", "sixth"] as const;

/** Six cells, each empty or one digit. A cleared cell stays a hole, so later digits keep their place. */
export type CodeDigits = readonly string[];

export const emptyDigits = (): CodeDigits => Array.from({ length: CODE_LENGTH }, () => "");

export const isComplete = (digits: CodeDigits) => digits.every(Boolean);

type Edit = { digits: CodeDigits; focus: number };

/**
 * What a cell reports when its text changes becomes the new digits and the cell to focus next.
 * A filled cell reports its old digit plus the new text, so the old digit is dropped first.
 * Only the incoming positions change: the digits after them stay.
 */
export function typeIntoCode(digits: CodeDigits, index: number, text: string): Edit | null {
  const old = digits[index] ?? "";
  let typed = text.replace(/\D/g, "");
  if (old && typed.length > 1) {
    if (typed.startsWith(old)) typed = typed.slice(old.length);
    else if (typed.endsWith(old)) typed = typed.slice(0, -old.length);
  }
  if (!typed) return null;
  const next = digits.map((digit, position) => {
    const offset = position - index;
    return offset >= 0 && offset < typed.length ? (typed[offset] ?? digit) : digit;
  });
  return { digits: next, focus: Math.min(index + typed.length, CODE_LENGTH - 1) };
}

/** Backspace clears its own cell; on an empty cell it clears the one before and steps back to it. */
export function backspaceInCode(digits: CodeDigits, index: number): Edit | null {
  const target = digits[index] ? index : index - 1;
  if (target < 0) return null;
  return {
    digits: digits.map((digit, position) => (position === target ? "" : digit)),
    focus: target,
  };
}
