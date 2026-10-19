import { api, type Id } from "@q9chat/convex";
import { useNavigate } from "@tanstack/react-router";
import { useAction } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useEffect, useState, useSyncExternalStore } from "react";

import type { SearchHit } from "../chat/types.js";
import { SearchDialog } from "../screens/dialogs.js";

type Group = FunctionReturnType<typeof api.groups.list>[number];
type Hits = FunctionReturnType<typeof api.messages.search>;
type Result =
  | { kind: "loading" }
  | { kind: "ready"; key: string; hits: Hits }
  | { kind: "error"; key: string };

function searchStatus(result: Result, query: string, online: boolean) {
  if (!online) return "You're offline. Reconnect to search messages.";
  if (query.length > 100) return "Use 100 characters or fewer to search.";
  if (!query) return "";
  if (result.kind === "error") return "Couldn't search. Change your search to try again.";
  return result.kind === "loading" ? "Searching…" : "";
}

function currentResult(result: Result, key: string): Result {
  if (result.kind === "loading") return result;
  return result.key === key ? result : { kind: "loading" };
}

function subscribeOnline(update: () => void) {
  window.addEventListener("online", update);
  window.addEventListener("offline", update);
  return () => {
    window.removeEventListener("online", update);
    window.removeEventListener("offline", update);
  };
}
function onlineSnapshot() {
  return typeof navigator !== "undefined" && navigator.onLine;
}
const serverOnlineSnapshot = () => false;

function useMessageSearch(query: string, groupId: Id<"groups"> | undefined) {
  const search = useAction(api.messages.search);
  const online = useSyncExternalStore(subscribeOnline, onlineSnapshot, serverOnlineSnapshot);
  const [result, setResult] = useState<Result>({ kind: "loading" });
  const trimmed = query.trim();
  const key = `${groupId ?? "all"}:${trimmed}`;
  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      if (!online || !trimmed || trimmed.length > 100) return;
      setResult({ kind: "loading" });
      void search({ query: trimmed, ...(groupId ? { groupId } : {}) }).then(
        (hits) => {
          if (active) setResult({ kind: "ready", key, hits });
        },
        () => {
          if (active) setResult({ kind: "error", key });
        },
      );
    }, 200);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [trimmed, online, search, groupId, key]);
  const current = currentResult(result, key);
  return {
    hits: current.kind === "ready" ? current.hits : [],
    status: searchStatus(current, trimmed, online),
  };
}

/** Search is an action; never expose responses from an obsolete query or membership list. */
function SearchJourney({
  groups,
  scopeId,
  photos,
  onClose,
}: {
  readonly groups: readonly Group[];
  readonly scopeId: string | null;
  readonly photos: ReadonlyMap<string, string>;
  readonly onClose: () => void;
}) {
  const navigate = useNavigate();
  const [scoped, setScoped] = useState(true);
  const scope = scoped
    ? groups.find((group) => group.groupId === scopeId && group.status === "member")
    : undefined;
  const [query, setQuery] = useState("");
  const results = useMessageSearch(query, scope?.groupId);
  const hits = results.hits.filter((hit) =>
    groups.some((group) => group.status === "member" && group.groupId === hit.groupId),
  );
  const display: SearchHit[] = hits.flatMap((hit) => {
    const group = groups.find((row) => row.groupId === hit.groupId);
    if (!group) return [];
    return [
      {
        ...hit,
        groupAvatar: {
          ...group.avatar,
          photoUrl: group.avatar.photo ? (photos.get(group.avatar.photo) ?? null) : null,
          color: group.kind === "group" ? null : group.avatar.color,
        },
        author: { ...hit.author, avatar: { ...hit.author.avatar, photoUrl: null } },
      },
    ];
  });
  function open(hit: SearchHit) {
    const current = hits.find(
      (row) => row.groupId === hit.groupId && row.sequence === hit.sequence,
    );
    if (!current) return;
    void navigate({
      to: "/",
      search: { group: current.groupId, message: current.sequence, authError: undefined },
    });
    onClose();
  }
  return (
    <SearchDialog
      query={query}
      onQueryChange={setQuery}
      scopeTitle={scope?.title ?? null}
      onClearScope={() => setScoped(false)}
      hits={results.status ? [] : display}
      status={results.status}
      onOpenHit={open}
      onClose={onClose}
    />
  );
}

export function useSearchJourney(
  groups: readonly Group[] | undefined,
  photos: ReadonlyMap<string, string>,
) {
  const [scope, setScope] = useState<{ id: string | null } | null>(null);
  return {
    isOpen: scope !== null,
    openAll: () => setScope({ id: null }),
    openGroup: (id: Id<"groups">) => setScope({ id }),
    dialog: scope ? (
      <SearchJourney
        groups={groups ?? []}
        photos={photos}
        scopeId={scope.id}
        onClose={() => setScope(null)}
      />
    ) : null,
  };
}
