import type { api } from "@q9chat/convex";
import type { FunctionReturnType } from "convex/server";
import { useState } from "react";

type Row = FunctionReturnType<typeof api.messages.range>[number];
function arrivalText(row: Extract<Row, { kind: "post" }>) {
  const file = row.attachments[0];
  if (file)
    return `${row.author.name} sent a ${file.kind === "image" ? "photo" : file.kind === "voice" ? "voice note" : "file"}`;
  return `${row.author.name}: ${Array.from(row.body).slice(0, 100).join("")}`;
}

function announcement(
  row: Row | undefined,
  previous: { readonly id: string; readonly text: string },
) {
  return row?.kind === "post"
    ? { id: row.id, text: arrivalText(row) }
    : { id: previous.id, text: previous.text };
}

/** Navigation establishes a new baseline; only subsequent incoming posts are arrivals. */
export function useArrivalAnnouncement(
  rows: readonly Row[],
  latest: number,
  initial: number,
  navigation: number,
) {
  const [arrival, setArrival] = useState({ sequence: initial, navigation, id: "", text: "" });
  const navigating = arrival.navigation !== navigation;
  const sequence = Math.max(arrival.sequence, navigating ? latest : (rows.at(-1)?.sequence ?? 0));
  if (sequence !== arrival.sequence || arrival.navigation !== navigation) {
    const incoming = navigating
      ? undefined
      : rows.findLast(
          (row) => row.sequence > arrival.sequence && row.kind === "post" && !row.author.isYou,
        );
    setArrival({
      sequence,
      navigation,
      ...announcement(incoming, arrival),
    });
  }
  return arrival;
}
