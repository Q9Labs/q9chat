import { api } from "@q9chat/convex";
import { useQuery } from "convex/react";
import type { FunctionArgs } from "convex/server";
import { useEffect, useState } from "react";

import { TypingLine } from "../chat/timeline-view.js";

/** Expiry and live typing updates belong to this line, not the bounded message list. */
export function LiveTypingLine({
  groupId,
}: {
  readonly groupId: FunctionArgs<typeof api.typing.list>["groupId"];
}) {
  const rows = useQuery(api.typing.list, { groupId });
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const next = rows?.filter((row) => row.expiresAt > now).map((row) => row.expiresAt);
    if (!next?.length) return () => {};
    const timer = window.setTimeout(
      () => setNow(Date.now()),
      Math.max(0, Math.min(...next) - Date.now()) + 1,
    );
    return () => window.clearTimeout(timer);
  }, [rows, now]);
  const names = (rows ?? [])
    .filter((row) => row.expiresAt > now)
    .map((row) => row.name)
    .toSorted((a, b) => a.localeCompare(b));
  return <TypingLine names={names} />;
}
