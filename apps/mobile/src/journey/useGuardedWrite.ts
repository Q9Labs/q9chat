import { useRef, useState } from "react";

import type { Phase } from "./groupRules.ts";
import { createWriteRun, standOf } from "./pendingWrite.ts";

const OFFLINE_NOTICE = "You're offline. Try again when you're back online.";

export type Removal = (event: { repeat: () => void }) => void;

/**
 * One write behind a screen's primary button (create, add, join). While it is out and the
 * connection is up, every way off the screen is held (Cancel, the Android Back button, the swipe).
 * Once the connection is down it may not end for a long time, so leaving is offered, with a
 * `prompt` that says it may still go through. A person who leaves that way is not followed by the
 * write: when it ends later, nothing navigates. Offline before sending, nothing is sent.
 *
 * The screen hands `holding` and `onRemove` to the router's `usePreventRemove`, which keeps the
 * navigation guard out of this hook, so a test can drive it.
 */
export function useGuardedWrite(connected: boolean) {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [asked, setAsked] = useState<{ leave: () => void } | null>(null);
  const [ended, setEnded] = useState(false);
  const [writes] = useState(createWriteRun);
  const busy = useRef(false);
  const leaving = useRef(false);
  const stand = standOf(connected, phase.kind === "pending");

  const onRemove: Removal = ({ repeat }) => {
    if (leaving.current) repeat();
    else if (stand === "waiting")
      setAsked({
        leave: () => {
          writes.supersede();
          leaving.current = true;
          setAsked(null);
          repeat();
        },
      });
  };

  function submit<T>(
    write: () => Promise<T>,
    done: (value: T) => void,
    describe: (cause: unknown) => string,
  ) {
    if (busy.current) return;
    if (stand === "offline") {
      setPhase({ kind: "failed", message: OFFLINE_NOTICE });
      return;
    }
    busy.current = true;
    setPhase({ kind: "pending" });
    void writes.run(write).then((end) => {
      if (end.stale) return;
      if (end.ok) {
        leaving.current = true;
        setEnded(true);
        done(end.value);
        return;
      }
      busy.current = false;
      setPhase({ kind: "failed", message: describe(end.error) });
    });
  }

  return {
    phase,
    stand,
    /** True while a write is out: the router should hold every removal of the screen and hand it to `onRemove`. */
    holding: phase.kind === "pending" && !ended,
    onRemove,
    submit,
    /** The question to put to a person who wants to leave while the write may not end; null otherwise. */
    prompt:
      stand === "waiting" && asked ? { leave: asked.leave, stay: () => setAsked(null) } : null,
  };
}
