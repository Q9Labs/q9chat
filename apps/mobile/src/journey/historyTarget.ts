import type { TimelineItem } from "../types.ts";

/** Keep the true unread boundary separate from a search destination. */
export function historyOpening(
  group: {
    firstUnreadSequence: number | null;
    lastReadSequence: number;
    lastSequence: number;
  },
  target: number | null,
) {
  const selected = target !== null && target <= group.lastSequence ? target : null;
  return {
    unread: selected ?? group.firstUnreadSequence,
    boundary: group.firstUnreadSequence,
    read: group.lastReadSequence,
    target: selected,
  };
}

export function highlightHistoryItem(item: TimelineItem, highlighted: boolean): TimelineItem {
  if (!highlighted || item.type !== "group") return item;
  return { ...item, messages: item.messages.map((message) => ({ ...message, highlighted: true })) };
}
