import { useEffect, useState, useSyncExternalStore } from "react";

import { createNameEditor, isDirty } from "./nameEditor";

/** The name field on the account screen; the rules live in `createNameEditor`. */
export function useNameEditing(
  savedName: string,
  connected: boolean,
  save: (name: string) => Promise<unknown>,
) {
  const [editor] = useState(() => createNameEditor({ saved: savedName, connected, save }));
  // The editor outlives renders, so it is handed the latest values after each one.
  useEffect(() => {
    editor.sync({ saved: savedName, connected, save });
  });
  const { draft, saving, unsaved } = useSyncExternalStore(editor.subscribe, editor.snapshot);
  return {
    name: draft ?? savedName,
    change: editor.change,
    saving,
    dirty: isDirty(draft, savedName),
    exit: editor.exit,
    clear: editor.clear,
    unsaved,
    keepEditing: editor.keepEditing,
    discard: editor.discard,
  };
}
