import { Fragment, useEffect, useState, type ReactNode, type RefObject } from "react";

import { Icon } from "../ui/icons.js";
import { useRoot } from "../ui/root.js";
import { authorLabel } from "./format.js";
import { Message, MessageRun, type MessageHandlers } from "./message.js";
import { useTimelineViewport } from "./timeline-viewport.js";
import { buildTimeline, type TimelineItem } from "./timeline.js";
import type { Author, EventView, MemberEvent, MessageView } from "./types.js";

function Names({
  people,
  remainder = false,
}: {
  readonly people: readonly Author[];
  readonly remainder?: boolean;
}) {
  return (
    <>
      {people.map((person, index) => (
        <Fragment key={person.id}>
          {index === 0 ? "" : !remainder && index === people.length - 1 ? " and " : ", "}
          <b>{authorLabel(person)}</b>
        </Fragment>
      ))}
    </>
  );
}

function OtherMembers({ event }: { readonly event: MemberEvent }) {
  if (event.type !== "added") return null;
  return event.othersCount ? ` and ${event.othersCount} others` : null;
}

function eventNodes(event: MemberEvent): ReactNode {
  if (event.type === "created") {
    return (
      <>
        <b>{authorLabel(event.by)}</b> created this group
      </>
    );
  }
  if (event.type === "added" || event.type === "removed") {
    return (
      <>
        <b>{authorLabel(event.by)}</b> {event.type}{" "}
        <Names people={event.people} remainder={event.type === "added" && !!event.othersCount} />
        <OtherMembers event={event} />
      </>
    );
  }
  if (event.type === "joined" || event.type === "left") {
    return (
      <>
        <Names people={event.people} /> {event.type}
      </>
    );
  }
  return (
    <>
      This is the start of your group with <Names people={event.people} />
    </>
  );
}

/** A quiet centered line for group events: "Shoaib removed Omar". */
function SystemLine({ message }: { readonly message: EventView }) {
  return (
    <div className="sys" id={`m-${message.id}`} data-sequence={message.sequence}>
      {eventNodes(message.event)}
    </div>
  );
}

/** Who is typing, with the three-dot pulse. Three or more collapse to a count. */
function TypingLine({ names: people }: { readonly names: readonly string[] }) {
  const [first, second] = people;
  if (first === undefined) return null;
  const text =
    people.length === 1
      ? `${first} is typing`
      : people.length === 2 && second !== undefined
        ? `${first} and ${second} are typing`
        : `${people.length} people are typing`;
  return (
    <output className="typing">
      <span className="dots" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      <span className="tt">{text}</span>
    </output>
  );
}

interface TimelineReading {
  readonly onVisible: ((sequence: number) => void) | undefined;
  readonly onOlder: (() => void) | undefined;
  readonly onNewer: (() => void) | undefined;
  readonly onLatest: (() => void) | undefined;
  readonly onAtBottom: ((bottom: boolean) => void) | undefined;
  readonly onAnchor: ((sequence: number) => void) | undefined;
  readonly announcement: { readonly id: string; readonly text: string };
  readonly loading: boolean;
  readonly latestRequest?: number;
}
const STATIC_READING: TimelineReading = {
  onVisible: undefined,
  onOlder: undefined,
  onNewer: undefined,
  onLatest: undefined,
  onAtBottom: undefined,
  onAnchor: undefined,
  announcement: { id: "", text: "" },
  loading: false,
};
export interface TimelineProps {
  readonly readOnly?: boolean;
  readonly reading?: TimelineReading;
  readonly messages: readonly MessageView[];
  /** First unread sequence, captured when the group opened; null for no divider. */
  readonly newFromSequence: number | null;
  readonly typing: readonly string[];
  readonly handlers: MessageHandlers;
  readonly onOpenAuthor: (author: Author) => void;
  /** The message whose More menu is open. */
  readonly menuMessageId: string | null;
  /** The message to flash after a jump. */
  readonly highlightId: string | null;
  readonly playing: { readonly messageId: string; readonly progress: number } | null;
}

type EntryProps = Pick<
  TimelineProps,
  "onOpenAuthor" | "highlightId" | "menuMessageId" | "playing" | "handlers" | "readOnly"
> & {
  readonly item: TimelineItem;
  readonly timeZone: ReturnType<typeof useRoot>["clock"]["timeZone"];
  readonly compact: boolean;
};
function TimelineEntry({
  item,
  timeZone,
  compact,
  onOpenAuthor,
  highlightId,
  menuMessageId,
  playing,
  handlers,
  readOnly = false,
}: EntryProps) {
  if (item.type === "day") return <div className="day">{item.label}</div>;
  if (item.type === "new")
    return (
      <div className="newline" data-new="">
        New since you last looked
      </div>
    );
  if (item.type === "event") return <SystemLine message={item.message} />;
  return (
    <MessageRun author={item.author} time={item.time} onOpenAuthor={onOpenAuthor}>
      {item.messages.map((message) => (
        <Message
          key={message.renderKey ?? message.id}
          message={message}
          timeZone={timeZone}
          compact={compact}
          highlighted={highlightId === message.id}
          menuOpen={menuMessageId === message.id}
          playProgress={playing?.messageId === message.id ? playing.progress : null}
          handlers={handlers}
          readOnly={readOnly}
        />
      ))}
    </MessageRun>
  );
}

const COMPACT_BELOW = 700;
const FAR_FROM_BOTTOM = 240;

function pageAtEdge(
  el: HTMLDivElement,
  {
    loading,
    onOlder,
    onNewer,
    setFar,
    preserveAnchor,
  }: {
    readonly loading: boolean;
    readonly onOlder: TimelineReading["onOlder"];
    readonly onNewer: TimelineReading["onNewer"];
    readonly setFar: (far: boolean) => void;
    readonly preserveAnchor: () => void;
  },
) {
  const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
  setFar(distance > FAR_FROM_BOTTOM);
  if (loading) return;
  const page = el.scrollTop < 40 ? onOlder : distance < 40 ? onNewer : undefined;
  if (page) {
    preserveAnchor();
    page();
  }
}

function useCompactTimeline(log: RefObject<HTMLDivElement | null>) {
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const measure = new ResizeObserver(([entry]) => {
      if (entry !== undefined) setCompact(entry.contentRect.width < COMPACT_BELOW);
    });
    if (log.current !== null) measure.observe(log.current);
    return () => measure.disconnect();
  }, [log]);
  return compact;
}

/**
 * The scrolling message log: date separators, runs, system lines, the
 * "new since you last looked" divider and the typing line, plus the
 * "Jump to latest" button once the reader is far from the bottom.
 */
export function Timeline({
  messages,
  newFromSequence,
  typing,
  handlers,
  onOpenAuthor,
  menuMessageId,
  highlightId,
  playing,
  readOnly = false,
  reading = STATIC_READING,
}: TimelineProps) {
  const { clock } = useRoot();
  const [far, setFar] = useState(false);
  const items = buildTimeline(messages, clock, newFromSequence);

  const { log, preserveAnchor, jump } = useTimelineViewport(
    messages,
    setFar,
    reading.onVisible,
    reading.loading,
    reading.onAtBottom,
    reading.onAnchor,
    reading.latestRequest,
  );

  const compact = useCompactTimeline(log);

  const toBottom = () => jump(reading.onLatest);
  const showJump = far || !!reading.onNewer;

  return (
    <>
      <div
        ref={log}
        className="tl"
        role="log"
        aria-label="Messages"
        aria-live="off"
        tabIndex={-1}
        aria-busy={reading.loading}
        onScroll={(event) =>
          pageAtEdge(event.currentTarget, {
            loading: reading.loading,
            onOlder: reading.onOlder,
            onNewer: reading.onNewer,
            setFar,
            preserveAnchor,
          })
        }
      >
        {items.map((item) => (
          <TimelineEntry
            key={item.key}
            item={item}
            timeZone={clock.timeZone}
            compact={compact}
            onOpenAuthor={onOpenAuthor}
            highlightId={highlightId}
            menuMessageId={menuMessageId}
            playing={playing}
            handlers={handlers}
            readOnly={readOnly}
          />
        ))}
      </div>
      <div className="arrival-announcement" aria-live="polite" aria-atomic="true">
        <span key={reading.announcement.id} data-arrival={reading.announcement.id}>
          {reading.announcement.text}
        </span>
      </div>
      <TypingLine names={typing} />
      <button
        type="button"
        className={`jump${showJump ? " on" : ""}`}
        tabIndex={showJump ? 0 : -1}
        onClick={toBottom}
      >
        <Icon name="down" />
        Jump to latest
      </button>
    </>
  );
}
