import { MAX_NAME, saveThenCheck } from "./nameRules.ts";

/** What the sheet over Account says when the name cannot be saved before leaving. */
type Unsaved = {
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
};

const ASK = {
  invalid: {
    text: "Enter a name of 1 to 60 characters, or discard your change.",
    confirmLabel: "Discard changes",
    cancelLabel: "Keep editing",
  },
  failed: {
    text: "Couldn't save your name. Try again, or discard your change.",
    confirmLabel: "Discard changes",
    cancelLabel: "Keep editing",
  },
  offline: {
    text: "You're offline, so your name can't be saved. Keep editing, or discard your change.",
    confirmLabel: "Discard changes",
    cancelLabel: "Keep editing",
  },
  // A Convex mutation cannot be cancelled: it stays queued and goes out when the connection is back.
  waiting: {
    text: "You're offline, so your name hasn't saved yet. It may still save when you're back online.",
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
  if (!connected) return inFlight ? "waiting" : "offline";
  return null;
}

/** What an exit does, from the field, the saved name, the connection and whether a save is out. */
function planExit(
  draft: string | null,
  { saved, connected }: NameEditorInputs,
  inFlight: boolean,
): Plan {
  const name = draft?.trim();
  if (name === undefined || name === saved) return { kind: "leave" };
  const ask = problemWith(name, connected, inFlight);
  if (ask) return { kind: "ask", ask };
  return inFlight ? { kind: "wait" } : { kind: "save", name };
}

/**
 * The name field on Account, without React. The screen leaves only when nothing is left to save:
 * a field that was not changed never saves, a change is saved first, and when it cannot be (invalid,
 * rejected, no connection, or a save that is still waiting for one) `unsaved` asks the person whether
 * to keep editing or leave without it. An exit that the person answered, or that a newer one
 * replaced, does nothing when its save ends later.
 */
export function createNameEditor(initial: NameEditorInputs) {
  let inputs = initial;
  let state: NameEditorState = { draft: null, saving: false, unsaved: null };
  const listeners = new Set<() => void>();
  let inFlight = false;
  /** Counts the answers given to the person; an exit started before the latest one is over. */
  let turn = 0;

  const set = (patch: Partial<NameEditorState>) => {
    state = { ...state, ...patch };
    for (const listener of listeners) listener();
  };
  const ask = (kind: keyof typeof ASK, leave: () => void) =>
    set({ unsaved: { ...ASK[kind], leave } });

  /** Saves `name`, then leaves if the field still holds it; a rejected save asks instead. */
  async function saveThenLeave(name: string, leave: () => void) {
    turn += 1;
    const mine = turn;
    inFlight = true;
    set({ saving: true });
    let outcome: "saved" | "edited" | "failed";
    try {
      const unchanged = await saveThenCheck(name, inputs.save, () => state.draft ?? "");
      outcome = unchanged ? "saved" : "edited";
    } catch {
      outcome = "failed";
    } finally {
      inFlight = false;
      set({ saving: false });
    }
    if (mine !== turn) return;
    if (outcome === "saved") leave();
    else if (outcome === "failed") ask("failed", leave);
  }

  async function exit(leave: () => void) {
    const plan = planExit(state.draft, inputs, inFlight);
    if (plan.kind === "leave") leave();
    else if (plan.kind === "ask") ask(plan.ask, leave);
    else if (plan.kind === "save") await saveThenLeave(plan.name, leave);
  }

  /** Drops the draft, so nothing holds the screen back from leaving. */
  function clear() {
    turn += 1;
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
      turn += 1;
      set({ unsaved: null });
    },
    discard: () => {
      const leave = state.unsaved?.leave;
      clear();
      leave?.();
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
