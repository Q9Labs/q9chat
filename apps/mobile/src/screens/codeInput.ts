export const CODE_LENGTH = 6;

/**
 * What a cell reports when its text changes becomes the code and the cell to focus next.
 * A filled cell reports its old digit plus the new text, so the old digit is dropped first.
 * Only the incoming positions change: the digits after them stay.
 */
export function typeIntoCode(
  code: string,
  index: number,
  text: string,
): { code: string; focus: number } | null {
  const old = code[index] ?? "";
  let typed = text.replace(/\D/g, "");
  if (old && typed.length > 1) {
    if (typed.startsWith(old)) typed = typed.slice(old.length);
    else if (typed.endsWith(old)) typed = typed.slice(0, -old.length);
  }
  if (!typed) return null;
  const head = code.slice(0, index);
  const next = head + typed + code.slice(head.length + typed.length);
  return {
    code: next.slice(0, CODE_LENGTH),
    focus: Math.min(head.length + typed.length, CODE_LENGTH - 1),
  };
}
