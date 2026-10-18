import { useState } from "react";

import { SearchDialog } from "../screens/dialogs.js";
import { searchHits } from "./fixtures.js";
import { ChatScene } from "./scene.js";

function noop() {}

/** A live chat: the composer and ⌘K search run on local state, and each callback is logged for the keyboard check. */
export function Playground() {
  const [draft, setDraft] = useState("");
  const [searching, setSearching] = useState(false);
  const [log, setLog] = useState<readonly string[]>([]);
  const record = (entry: string) => setLog((entries) => [...entries, entry]);
  return (
    <ChatScene
      draft={draft}
      onOpenSearch={() => setSearching(true)}
      composerHandlers={{
        onChange: setDraft,
        onSend: () => {
          record(`send:${JSON.stringify(draft)}`);
          setDraft("");
        },
        onEditLast: () => record("edit-last"),
      }}
      overlay={
        <>
          <output id="playground-log" hidden>
            {log.join("\n")}
          </output>
          {searching ? (
            <SearchDialog
              query=""
              onQueryChange={noop}
              scopeTitle={null}
              onClearScope={noop}
              hits={searchHits()}
              onOpenHit={() => setSearching(false)}
              onClose={() => setSearching(false)}
            />
          ) : null}
        </>
      }
    />
  );
}
