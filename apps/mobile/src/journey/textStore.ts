import type { api } from "@q9chat/convex";
import type { FunctionReturnType } from "convex/server";
import { Either, Schema } from "effect";
import { File, Paths } from "expo-file-system";

import { restoreText, SavedText, type Pending, type TextState } from "./textState";

type Receipt = FunctionReturnType<typeof api.messages.send>;
type Delivered = Omit<Pending, "status"> & Receipt & { status: "sent" };
type Snapshot = { draft: string; pending: readonly (Pending | Delivered)[]; error: string };

/** One synchronous durable write before clearing the composer or making a network request. */
function createTextStore(key: string) {
  const file = new File(Paths.document, `q9-text-${key}.json`);
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
    update(next: Omit<Snapshot, "error">) {
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
      publish({ ...snapshot, error });
    },
  };
}
const stores = new Map<string, ReturnType<typeof createTextStore>>();
export function textStore(account: string, group: string) {
  const key = `${account}-${group}`;
  let store = stores.get(key);
  if (!store) {
    store = createTextStore(key);
    stores.set(key, store);
  }
  return store;
}
