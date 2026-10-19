import { api, type Id } from "@q9chat/convex";
import { useAction } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useEffect, useState } from "react";

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
}) {
  const { connected, query: trimmed, scopeId } = input;
  const search = useAction(api.messages.search);
  const [result, setResult] = useState<Result | null>(null);
  const key = `${scopeId ?? "all"}:${trimmed}`;
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      if (!connected || !trimmed) return;
      void search({ query: trimmed, ...(scopeId ? { groupId: scopeId } : {}) }).then(
        (hits) => {
          if (active) setResult({ kind: "ready", key, hits });
        },
        () => {
          if (active) setResult({ kind: "failed", key });
        },
      );
    }, 200);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [connected, trimmed, scopeId, search, key]);
  const current = result?.key === key ? result : null;
  return { result: current, status: searchStatus({ ...input, result: current }) };
}
