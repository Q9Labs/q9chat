export const CODE_LENGTH = 6;

/** Stable React keys for the six cells that draw the code. */
export const CELL_IDS = ["first", "second", "third", "fourth", "fifth", "sixth"] as const;

export const isComplete = (code: string) => code.length === CODE_LENGTH;

function commonPrefix(a: string, b: string) {
  let length = 0;
  while (length < a.length && length < b.length && a[length] === b[length]) length += 1;
  return length;
}

/**
 * The code after the field reports `text` while holding `previous`. Only digits count and the code is
 * six long. A paste that adds a whole code to what is already there (over a digit, or after some)
 * replaces it instead of piling up: the added run is what differs from `previous`.
 */
export function readCode(previous: string, text: string): string {
  const digits = text.replace(/\D/gu, "");
  if (digits.length <= CODE_LENGTH) return digits;
  const start = commonPrefix(previous, digits);
  const rest = previous.slice(start);
  let end = 0;
  while (
    end < rest.length &&
    end < digits.length - start &&
    rest[rest.length - 1 - end] === digits[digits.length - 1 - end]
  )
    end += 1;
  const added = digits.slice(start, digits.length - end);
  return (added.length >= CODE_LENGTH ? added : digits).slice(0, CODE_LENGTH);
}
