export function pickerLimit(mode: "new" | "add", count: number): string | null {
  return mode === "add" && count > 50 ? "Add up to 50 people at a time." : null;
}
