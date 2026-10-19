import { MAX_NAME, saveThenCheck } from "./nameRules.ts";
import { createWriteRun, standOf } from "./pendingWrite.ts";

/** What the sheet over Account says when the name cannot be saved before leaving. */
type Unsaved = {
  /** Which question this is: Discard on a name question goes on to the photo question, if one is due. */
  kind: keyof typeof ASK;
  title: string;
  text: string;
  confirmLabel: string;
  cancelLabel: string;
  /** What the person was leaving for; it runs only on the sheet's confirm. */
  leave: () => void;
};

type NameEditorState = {
  /** What the person typed; null while the field shows the saved name. */
  draft: string | null;
  /** A save is out: the field is locked until it ends. */
  saving: boolean;
  unsaved: Unsaved | null;
};

/** What the editor needs from the screen; `sync` hands it the latest values after every render. */
export type NameEditorInputs = {
  /** The name on the profile now, which can change while Account is open. */
  saved: string;
  /** Whether the live connection to Convex is up now. */
  connected: boolean;
  save: (name: string) => Promise<unknown>;
  /** A photo change (remove or upload) has not finished; leaving would drop it. */
  photoBusy: boolean;
};

const NAME_TITLE = "Your name isn't saved";

const ASK = {
  invalid: {
    title: NAME_TITLE,
    text: "Enter a name of 1 to 60 characters, or discard your change.",
    confirmLabel: "Discard changes",
    cancelLabel: "Keep editing",
  },
  failed: {
    title: NAME_TITLE,
    text: "Couldn't save your name. Try again, or discard your change.",
    confirmLabel: "Discard changes",
    cancelLabel: "Keep editing",
  },
  offline: {
    title: NAME_TITLE,
    text: "You're offline, so your name can't be saved. Keep editing, or discard your change.",
    confirmLabel: "Discard changes",
    cancelLabel: "Keep editing",
  },
  // A Convex mutation cannot be cancelled: it stays queued and goes out when the connection is back.
  waiting: {
    title: NAME_TITLE,
    text: "You're offline, so your name hasn't saved yet. It may still save when you're back online.",
    confirmLabel: "Leave anyway",
    cancelLabel: "Stay here",
  },
  photo: {
    title: "Your photo isn't saved",
    text: "Your photo change isn't done yet. If you leave now, it may not be saved.",
    confirmLabel: "Leave anyway",
    cancelLabel: "Stay here",
  },
} as const;

/** True when the field holds a change from the saved name. */
export const isDirty = (draft: string | null, saved: string) =>
  draft !== null && draft.trim() !== saved;

type Plan =
  | { kind: "leave" }
  | { kind: "ask"; ask: keyof typeof ASK }
  /** A save is out and the connection is up, so it ends soon and the first exit finishes the job. */
  | { kind: "wait" }
  | { kind: "save"; name: string };

/** Why a changed name cannot be saved right now, or null when it can. */
function problemWith(name: string, connected: boolean, inFlight: boolean): keyof typeof ASK | null {
  if (!name || name.length > MAX_NAME) return "invalid";
  const stand = standOf(connected, inFlight);
  return stand === "offline" || stand === "waiting" ? stand : null;
}

/** What an exit does, from the field, the saved name, the connection, a photo change and whether a save is out. */
function planExit(draft: string | null, inputs: NameEditorInputs, inFlight: boolean): Plan {
  const name = draft?.trim();
  if (name === undefined || name === inputs.saved)
    return inputs.photoBusy ? { kind: "ask", ask: "photo" } : { kind: "leave" };
  const ask = problemWith(name, inputs.connected, inFlight);
  if (ask) return { kind: "ask", ask };
  return inFlight ? { kind: "wait" } : { kind: "save", name };
}

/**
 * The name field on Account, without React. The screen leaves only when nothing is left to save:
 * a field that was not changed never saves, a change is saved first, and when it cannot be (invalid,
 * rejected, no connection, or a save that is still waiting for one) `unsaved` asks the person whether
 * to keep editing or leave without it. A photo change that has not finished is asked about the same way. An exit that the person answered, or that a newer one
 * replaced, does nothing when its save ends later.
 */
export function createNameEditor(initial: NameEditorInputs) {
  let inputs = initial;
  let state: NameEditorState = { draft: null, saving: false, unsaved: null };
  const listeners = new Set<() => void>();
  /** An exit started before the person's latest answer is over: its save may end, but nothing leaves. */
  const writes = createWriteRun();

  const set = (patch: Partial<NameEditorState>) => {
    state = { ...state, ...patch };
    for (const listener of listeners) listener();
  };
  const ask = (kind: keyof typeof ASK, leave: () => void) =>
    set({ unsaved: { ...ASK[kind], kind, leave } });

  /** Saves `name`, then leaves if the field still holds it; a rejected save asks instead. */
  async function saveThenLeave(name: string, leave: () => void) {
    set({ saving: true });
    const end = await writes.run(() => saveThenCheck(name, inputs.save, () => state.draft ?? ""));
    set({ saving: false });
    if (end.stale) return;
    if (!end.ok) ask("failed", leave);
    else if (end.value) {
      if (inputs.photoBusy) ask("photo", leave);
      else leave();
    }
  }

  async function exit(leave: () => void) {
    const plan = planExit(state.draft, inputs, state.saving);
    if (plan.kind === "leave") leave();
    else if (plan.kind === "ask") ask(plan.ask, leave);
    else if (plan.kind === "save") await saveThenLeave(plan.name, leave);
  }

  /** Drops the draft, so nothing holds the screen back from leaving. */
  function clear() {
    writes.supersede();
    set({ draft: null, unsaved: null });
  }

  return {
    sync: (next: NameEditorInputs) => {
      inputs = next;
    },
    exit,
    clear,
    change: (next: string) => set({ draft: next }),
    keepEditing: () => {
      writes.supersede();
      set({ unsaved: null });
    },
    discard: () => {
      const unsaved = state.unsaved;
      clear();
      if (!unsaved) return;
      // Dropping the name must not drop a photo change that is still pending: ask about that next.
      if (unsaved.kind === "photo") unsaved.leave();
      else void exit(unsaved.leave);
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    snapshot: () => state,
  };
}
