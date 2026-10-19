import { useEffect, useState, useSyncExternalStore } from "react";

import { createNameEditor, isDirty, type NameEditorInputs } from "./nameEditor.ts";

/** The name field on the account screen; the rules live in `createNameEditor`. */
export function useNameEditing(inputs: NameEditorInputs) {
  const [editor] = useState(() => createNameEditor(inputs));
  // The editor outlives renders, so it is handed the latest values after each one.
  useEffect(() => {
    editor.sync(inputs);
  });
  const { draft, saving, unsaved } = useSyncExternalStore(editor.subscribe, editor.snapshot);
  return {
    name: draft ?? inputs.saved,
    change: editor.change,
    saving,
    dirty: isDirty(draft, inputs.saved),
    exit: editor.exit,
    clear: editor.clear,
    unsaved,
    keepEditing: editor.keepEditing,
    discard: editor.discard,
  };
}
