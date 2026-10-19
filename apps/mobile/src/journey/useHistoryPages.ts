import { api } from "@q9chat/convex";
import { useQueries } from "convex/react";
import { useMemo, useState } from "react";

import { PAGE_SIZE, pageOf, type HistoryGroup, type HistoryRow } from "./historyRows";

export function useHistoryPages(group: HistoryGroup, unread: number | null) {
  const [window, setWindow] = useState(() => {
    const page = pageOf(unread ?? group.lastSequence);
    return { first: page, last: Math.min(pageOf(group.lastSequence), page + 1) };
  });
  const queries = useMemo(
    () =>
      Object.fromEntries(
        Array.from({ length: window.last - window.first + 1 }, (_, i) => {
          const page = window.first + i;
          return [
            String(page % 3),
            {
              query: api.messages.range,
              args: {
                groupId: group.groupId,
                fromSequence: page * PAGE_SIZE + 1,
                toSequence: (page + 1) * PAGE_SIZE,
              },
            },
          ];
        }),
      ),
    [group.groupId, window],
  );
  const pages: { readonly [key: string]: HistoryRow[] | Error | undefined } = useQueries(queries);
  const results = Object.values(pages);
  const loading = results.some((result) => result === undefined);
  const failed = results.some((result) => result instanceof Error);
  const [retained, setRetained] = useState<HistoryRow[]>([]);
  const loaded =
    !loading && !failed
      ? results
          .flatMap((result) => (Array.isArray(result) ? result : []))
          // oxlint-disable-next-line unicorn/no-array-sort -- Hermes lacks toSorted; flatMap creates an owned array.
          .sort((a, b) => a.sequence - b.sequence)
      : null;
  if (loaded && (loaded.length !== retained.length || loaded.some((row, i) => row !== retained[i])))
    setRetained(loaded);
  const rows = loaded ?? retained;
  return { window, setWindow, rows, loading, failed };
}
