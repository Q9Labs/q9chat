import { clockTime, dayLabel, dayNumber, RUN_WINDOW_MS, type Clock } from "./format.js";
import type { Author, DeletedView, EventView, MessageView, PostView } from "./types.js";

export type RunMessage = PostView | DeletedView;

export type TimelineItem =
  | { readonly type: "day"; readonly key: string; readonly label: string }
  | { readonly type: "new"; readonly key: string }
  | { readonly type: "event"; readonly key: string; readonly message: EventView }
  | {
      readonly type: "run";
      readonly key: string;
      readonly author: Author;
      readonly time: string;
      readonly messages: readonly RunMessage[];
    };

/**
 * Lays messages out as date separators, the "new since you last looked" divider,
 * system lines and runs. A run is one person's messages, each less than five
 * minutes after the one before, and carries one name, avatar and time.
 * `newFromSequence` is the first unread sequence; the divider goes before the
 * first unread message from someone else.
 */
export function buildTimeline(
  messages: readonly MessageView[],
  clock: Clock,
  newFromSequence: number | null,
): readonly TimelineItem[] {
  const items: TimelineItem[] = [];
  let day: number | null = null;
  let run: { author: Author; time: string; messages: RunMessage[]; last: number } | null = null;
  let dividerPlaced = false;

  const close = () => {
    if (run === null) return;
    items.push({
      type: "run",
      key: `run-${run.messages[0]?.id ?? ""}`,
      author: run.author,
      time: run.time,
      messages: run.messages,
    });
    run = null;
  };

  for (const message of messages) {
    const today = dayNumber(message.createdAt, clock.timeZone);
    if (today !== day) {
      close();
      items.push({ type: "day", key: `day-${today}`, label: dayLabel(message.createdAt, clock) });
      day = today;
    }
    if (
      !dividerPlaced &&
      newFromSequence !== null &&
      message.sequence >= newFromSequence &&
      message.kind !== "event" &&
      !message.author.isYou
    ) {
      close();
      items.push({ type: "new", key: "new" });
      dividerPlaced = true;
    }
    if (message.kind === "event") {
      close();
      items.push({ type: "event", key: message.id, message });
      continue;
    }
    if (
      run !== null &&
      run.author.id === message.author.id &&
      message.createdAt - run.last < RUN_WINDOW_MS
    ) {
      run.messages.push(message);
      run.last = message.createdAt;
    } else {
      close();
      run = {
        author: message.author,
        time: clockTime(message.createdAt, clock.timeZone),
        messages: [message],
        last: message.createdAt,
      };
    }
  }
  close();
  return items;
}
