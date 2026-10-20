import { useCallback, useEffect, useRef, useState } from "react";

const TOAST_MS = 2200;

/** A status line that clears itself after about 2.2 seconds, like the mock's toast. */
export function useToast(): [string | null, (text: string | null) => void] {
  const [text, setText] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const show = useCallback((next: string | null) => {
    if (timer.current) clearTimeout(timer.current);
    setText(next);
    timer.current = next === null ? null : setTimeout(() => setText(null), TOAST_MS);
  }, []);
  return [text, show];
}
