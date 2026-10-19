import type { api } from "@q9chat/convex";
import type { FunctionReturnType } from "convex/server";
import { Either, Schema } from "effect";

import { restoreText, SavedText, type Pending, type TextState } from "./textState.ts";

type Receipt = FunctionReturnType<typeof api.messages.send>;
type Delivered = Omit<Pending, "status"> & Receipt & { status: "sent" };
type Snapshot = { draft: string; pending: readonly (Pending | Delivered)[]; error: string };

/** One synchronous durable write before clearing the composer or making a network request. */
function createTextStore(file: TextFile) {
  let snapshot: Snapshot = { draft: "", pending: [], error: "" };
  try {
    if (file.exists) {
      const decoded = Schema.decodeUnknownEither(Schema.parseJson(SavedText))(file.textSync());
      snapshot = Either.isRight(decoded)
        ? { ...restoreText(decoded.right), error: "" }
        : { ...snapshot, error: "Couldn't restore unsent messages on this device." };
    }
  } catch {
    snapshot = { ...snapshot, error: "Couldn't restore unsent messages on this device." };
  }
  let retired = false;
  const listeners = new Set<() => void>();
  function publish(next: Snapshot) {
    snapshot = next;
    for (const listener of listeners) listener();
  }
  return {
    get: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    retire() {
      retired = true;
      publish({ draft: "", pending: [], error: "" });
      listeners.clear();
    },
    update(next: Omit<Snapshot, "error">) {
      if (retired) return false;
      const durable: TextState = {
        draft: next.draft,
        pending: next.pending.filter((post): post is Pending => post.status !== "sent"),
      };
      try {
        file.writeSync(JSON.stringify(durable));
        publish({ ...next, error: "" });
        return true;
      } catch {
        publish({ ...snapshot, error: "Couldn't save this message on this device. Try again." });
        return false;
      }
    },
    error(this: void, error: string) {
      if (!retired) publish({ ...snapshot, error });
    },
  };
}
/** Storage is the native boundary; the store lifetime and scoped erasure run without React. */
type TextFile = {
  readonly exists: boolean;
  textSync: () => string;
  writeSync: (text: string) => void;
  delete: () => void;
};
export function createTextStores(storage: {
  file: (name: string) => TextFile;
  names: () => string[];
}) {
  const stores = new Map<string, ReturnType<typeof createTextStore>>();
  // Sign-out must also work after an offline restart, before Convex can return the profile.
  const owner = storage.file("q9-text-profile.json");
  let remembered: string | null = null;
  function rememberTextProfile(profile: string) {
    if (remembered === profile) return;
    owner.writeSync(profile);
    remembered = profile;
  }
  function clear(profile: string, group?: string) {
    const prefix = `q9-text-${profile}-`;
    const matches = (name: string) =>
      group === undefined
        ? name.startsWith(prefix) && name.endsWith(".json")
        : name === `${prefix}${group}.json`;
    for (const [name, store] of stores) {
      if (!matches(name)) continue;
      store.retire();
      stores.delete(name);
    }
    // Enumerate disk too: most groups need not have been opened in this process.
    for (const name of storage.names()) {
      if (matches(name)) storage.file(name).delete();
    }
  }
  return {
    rememberTextProfile,
    textStore(this: void, profile: string, group: string) {
      rememberTextProfile(profile);
      const name = `q9-text-${profile}-${group}.json`;
      let store = stores.get(name);
      if (!store) {
        store = createTextStore(storage.file(name));
        stores.set(name, store);
      }
      return store;
    },
    clearGroupText: (profile: string, group: string) => clear(profile, group),
    clearAccountText(this: void) {
      if (!owner.exists) return;
      clear(owner.textSync());
      owner.delete();
      remembered = null;
    },
  };
}
