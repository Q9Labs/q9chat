import { api, type Id } from "@q9chat/convex";
import { useAction } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useEffect, useMemo, useState } from "react";

import { retainSearchHits } from "./searchRules";

type Result =
  | { kind: "ready"; key: string; hits: FunctionReturnType<typeof api.messages.search> }
  | { kind: "failed"; key: string };

function searchStatus(input: {
  connected: boolean;
  query: string;
  scopeLost: boolean;
  loadingGroups: boolean;
  result: Result | null;
}) {
  if (!input.connected) return "You're offline. Reconnect to search messages.";
  if (input.scopeLost) return "You no longer have access to this group.";
  if (!input.query) return "";
  if (!input.result || input.loadingGroups) return "Searching…";
  if (input.result.kind === "failed") return "Couldn't search. Change your search to try again.";
  return "";
}

export function useMessageSearch(input: {
  connected: boolean;
  query: string;
  scopeId: Id<"groups"> | undefined;
  scopeLost: boolean;
  loadingGroups: boolean;
  groups: FunctionReturnType<typeof api.groups.list> | undefined;
}) {
  const { connected, query: trimmed, scopeId } = input;
  const search = useAction(api.messages.search);
  const key = `${scopeId ?? "all"}:${trimmed}`;
  const membershipKey = (input.groups ?? [])
    .filter((group) => group.status === "member")
    .map((group) => group.groupId)
    .join(",");
  const members = useMemo(() => new Set(membershipKey.split(",")), [membershipKey]);
  const [cache, setCache] = useState<{ membershipKey: string; result: Result | null }>({
    membershipKey,
    result: null,
  });
  let result = cache.result;
  if (cache.membershipKey !== membershipKey) {
    // Membership changes invalidate every cached snippet before another frame can use it.
    result = null;
    setCache({ membershipKey, result: null });
  }
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      if (!connected || !trimmed || input.scopeLost || input.loadingGroups) return;
      void search({ query: trimmed, ...(scopeId ? { groupId: scopeId } : {}) })
        .then(
          (hits): Result => ({ kind: "ready", key, hits: retainSearchHits(hits, members) }),
          (): Result => ({ kind: "failed", key }),
        )
        .then((answer) => {
          if (active) setCache({ membershipKey, result: answer });
        });
    }, 200);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [
    connected,
    trimmed,
    scopeId,
    search,
    key,
    members,
    membershipKey,
    input.scopeLost,
    input.loadingGroups,
  ]);
  const current = result?.key === key ? result : null;
  return { result: current, status: searchStatus({ ...input, result: current }) };
}
