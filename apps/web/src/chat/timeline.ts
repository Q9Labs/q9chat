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

interface Run {
  readonly author: Author;
  readonly time: string;
  readonly messages: RunMessage[];
  last: number;
}

interface Builder {
  readonly items: TimelineItem[];
  day: number | null;
  run: Run | null;
  dividerPlaced: boolean;
}

function closeRun(builder: Builder): void {
  const { run } = builder;
  if (run === null) return;
  builder.items.push({
    type: "run",
    key: `run-${run.messages[0]?.id ?? ""}`,
    author: run.author,
    time: run.time,
    messages: run.messages,
  });
  builder.run = null;
}

function addDay(builder: Builder, message: MessageView, clock: Clock): void {
  const today = dayNumber(message.createdAt, clock.timeZone);
  if (today === builder.day) return;
  closeRun(builder);
  builder.items.push({
    type: "day",
    key: `day-${today}`,
    label: dayLabel(message.createdAt, clock),
  });
  builder.day = today;
}

/** The divider goes before the first unread message from someone else. */
function opensDivider(
  builder: Builder,
  message: MessageView,
  newFromSequence: number | null,
): boolean {
  return (
    !builder.dividerPlaced &&
    newFromSequence !== null &&
    message.sequence >= newFromSequence &&
    message.kind !== "event" &&
    !message.author.isYou
  );
}

function continuesRun(run: Run | null, message: RunMessage): run is Run {
  return (
    run !== null &&
    run.author.id === message.author.id &&
    message.createdAt - run.last < RUN_WINDOW_MS
  );
}

function addToRun(builder: Builder, message: RunMessage, clock: Clock): void {
  if (continuesRun(builder.run, message)) {
    builder.run.messages.push(message);
    builder.run.last = message.createdAt;
    return;
  }
  closeRun(builder);
  builder.run = {
    author: message.author,
    time: clockTime(message.createdAt, clock.timeZone),
    messages: [message],
    last: message.createdAt,
  };
}

function addMessage(
  builder: Builder,
  message: MessageView,
  clock: Clock,
  newFromSequence: number | null,
): void {
  addDay(builder, message, clock);
  if (opensDivider(builder, message, newFromSequence)) {
    closeRun(builder);
    builder.items.push({ type: "new", key: "new" });
    builder.dividerPlaced = true;
  }
  if (message.kind !== "event") {
    addToRun(builder, message, clock);
    return;
  }
  closeRun(builder);
  builder.items.push({ type: "event", key: message.id, message });
}

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
  const builder: Builder = { items: [], day: null, run: null, dividerPlaced: false };
  for (const message of messages) addMessage(builder, message, clock, newFromSequence);
  closeRun(builder);
  return builder.items;
}
