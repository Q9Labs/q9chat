import { useEffect, useState } from "react";

/** A stage that stays "loading" this long is let through, so a stuck restore never keeps the splash up for good. */
export const GIVE_UP_MS = 8_000;

/**
 * False until the stage has answered for the first time ("loading" is no answer), and true for good
 * after that, so a later refresh does not tear the navigator down. The root layout holds the router
 * back until then: a cold link to a screen behind sign-in is dropped when the router starts while the
 * guard is still closed.
 */
export function useStageAnswered(kind: string) {
  const [answered, setAnswered] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setAnswered(true), kind === "loading" ? GIVE_UP_MS : 0);
    return () => clearTimeout(timer);
  }, [kind]);
  return answered;
}
