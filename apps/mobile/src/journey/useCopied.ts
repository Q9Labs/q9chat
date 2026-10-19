import * as Clipboard from "expo-clipboard";
import { useEffect, useRef, useState } from "react";

const COPIED_MS = 2200;

/** Copies text to the clipboard. `copied` stays true for a moment so a button can say "Copied". */
export function useCopied() {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  /** Whether the text reached the clipboard. */
  async function copy(text: string) {
    try {
      await Clipboard.setStringAsync(text);
    } catch {
      return false;
    }
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), COPIED_MS);
    return true;
  }
  return { copied, copy };
}
