import { api, type Id } from "@q9chat/convex";
import { useConvexConnectionState, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useRouter } from "expo-router";
import { useState } from "react";

import { SearchScreen } from "../screens/SearchScreen";
import { config } from "../session/config";
import { rowStamp } from "./groupRows";
import { leaveScreen } from "./leaveScreen";
import { liveAvatar } from "./livePeople";
import { splitSearchSnippet } from "./searchRules";
import { useMessageSearch } from "./useMessageSearch";
import { useToday } from "./useToday";

/** Search is an action: discard obsolete answers and filter them against live memberships. */
export function SearchJourney({ groupId }: { groupId: Id<"groups"> | undefined }) {
  const router = useRouter();
  const groups = useQuery(api.groups.list, {});
  const { isWebSocketConnected: connected } = useConvexConnectionState();
  const [query, setQuery] = useState("");
  const [scoped, setScoped] = useState(true);
  const today = useToday();
  const scopeId = scoped ? groupId : undefined;
  const scope = searchScope(groups, scopeId);
  const trimmed = query.trim();
  const { result: current, status } = useMessageSearch({
    connected,
    query: trimmed,
    scopeId,
    scopeLost: scope.lost,
    loadingGroups: !groups,
    groups,
  });
  const hits =
    status || current?.kind !== "ready"
      ? []
      : searchHits(current.hits, groups ?? [], trimmed, today);
  return (
    <SearchScreen
      query={query}
      onQueryChange={setQuery}
      scopeTitle={scope.title}
      onClearScope={() => setScoped(false)}
      hits={hits}
      status={status}
      onOpenHit={(hit) =>
        router.dismissTo({
          pathname: "/g/[groupId]",
          params: {
            groupId: hit.groupId,
            m: String(hit.sequence),
            jump: String(Date.now()),
          },
        })
      }
      onCancel={() => leaveScreen(router)}
    />
  );
}

function searchHits(
  hits: FunctionReturnType<typeof api.messages.search>,
  groups: FunctionReturnType<typeof api.groups.list>,
  query: string,
  today: Date,
) {
  return hits.flatMap((hit) => {
    const group = groups.find((row) => row.status === "member" && row.groupId === hit.groupId);
    if (!group) return [];
    return [
      {
        groupId: hit.groupId,
        sequence: hit.sequence,
        groupTitle: hit.groupTitle,
        groupAvatar: liveAvatar(group.avatar, group.kind, config.siteUrl),
        author: hit.author.name,
        whenLabel: rowStamp(hit.createdAt, today),
        ...splitSearchSnippet(hit.snippet, query),
      },
    ];
  });
}

function searchScope(
  groups: FunctionReturnType<typeof api.groups.list> | undefined,
  scopeId: Id<"groups"> | undefined,
) {
  if (!scopeId) return { title: null, lost: false };
  if (!groups) return { title: null, lost: false };
  const group = groups.find((row) => row.groupId === scopeId);
  if (group?.status !== "member") return { title: null, lost: true };
  return { title: group.title, lost: false };
}
