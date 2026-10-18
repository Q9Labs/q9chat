import { useRef, useState } from "react";

import { MAX_NAME, saveThenCheck } from "./nameRules";

type Outcome = "saved" | "invalid" | "failed" | "edited" | "busy";
type Unsaved = { text: string; leave: () => void };

const UNSAVED_TEXT = {
  invalid: "Enter a name of 1 to 60 characters, or discard your change.",
  failed: "Couldn't save your name. Try again, or discard your change.",
} as const;

/**
 * The name field on the account screen. The field is locked while a save is out, and an exit is
 * allowed only when the saved value is what the field holds; when it cannot save, `unsaved` asks
 * whether to keep editing or discard.
 */
export function useNameEditing(savedName: string, save: (name: string) => Promise<unknown>) {
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [unsaved, setUnsaved] = useState<Unsaved | null>(null);
  const typed = useRef(savedName);
  const inFlight = useRef(false);

  function change(next: string) {
    typed.current = next;
    setDraft(next);
  }

  async function saveDraft(): Promise<Outcome> {
    if (inFlight.current) return "busy";
    const displayName = typed.current.trim();
    if (displayName === savedName) return "saved";
    if (!displayName || displayName.length > MAX_NAME) return "invalid";
    inFlight.current = true;
    setSaving(true);
    try {
      return (await saveThenCheck(displayName, save, () => typed.current)) ? "saved" : "edited";
    } catch {
      return "failed";
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }

  /** Saves the draft, then runs `leave`; or asks what to do when the draft cannot be saved. */
  async function exit(leave: () => void) {
    const outcome = await saveDraft();
    if (outcome === "saved") leave();
    else if (outcome === "invalid" || outcome === "failed")
      setUnsaved({ text: UNSAVED_TEXT[outcome], leave });
  }

  /** Drops the draft, so nothing holds the screen back from leaving. */
  function clear() {
    typed.current = savedName;
    setDraft(null);
  }

  function discard() {
    const leave = unsaved?.leave;
    clear();
    setUnsaved(null);
    leave?.();
  }

  return {
    name: draft ?? savedName,
    change,
    saving,
    dirty: draft !== null && draft.trim() !== savedName,
    exit,
    clear,
    unsaved,
    keepEditing: () => setUnsaved(null),
    discard,
  };
}
