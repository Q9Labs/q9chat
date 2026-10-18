import { Fragment, useEffect, useState, type ReactNode } from "react";

import { Icon } from "../ui/icons.js";
import { useRoot } from "../ui/root.js";
import { authorLabel } from "./format.js";
import { Message, MessageRun, type MessageHandlers } from "./message.js";
import { useTimelineViewport } from "./timeline-viewport.js";
import { buildTimeline } from "./timeline.js";
import type { Author, EventView, MemberEvent, MessageView } from "./types.js";

function Names({ people }: { readonly people: readonly Author[] }) {
  return (
    <>
      {people.map((person, index) => (
        <Fragment key={person.id}>
          {index === 0 ? "" : index === people.length - 1 ? " and " : ", "}
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
        <b>{authorLabel(event.by)}</b> {event.type} <Names people={event.people} />
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
  return <div className="sys">{eventNodes(message.event)}</div>;
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

export interface TimelineProps {
  readonly readOnly?: boolean;
  readonly onVisible?: (sequence: number) => void;
  readonly onOlder?: (() => void) | undefined;
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

const COMPACT_BELOW = 700;
const FAR_FROM_BOTTOM = 240;

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
  onVisible,
  onOlder,
}: TimelineProps) {
  const { clock } = useRoot();
  const [far, setFar] = useState(false);
  const [compact, setCompact] = useState(false);
  const items = buildTimeline(messages, clock, newFromSequence);

  const log = useTimelineViewport(messages, setFar, onVisible);

  useEffect(() => {
    const measure = new ResizeObserver(([entry]) => {
      if (entry !== undefined) setCompact(entry.contentRect.width < COMPACT_BELOW);
    });
    if (log.current !== null) measure.observe(log.current);
    return () => measure.disconnect();
  }, [log]);

  const toBottom = () => {
    const el = log.current;
    if (el !== null)
      el.scrollTo({
        top: el.scrollHeight,
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      });
  };

  return (
    <>
      <div
        ref={log}
        className="tl"
        role="log"
        aria-label="Messages"
        onScroll={(event) => {
          const el = event.currentTarget;
          setFar(el.scrollHeight - el.scrollTop - el.clientHeight > FAR_FROM_BOTTOM);
          if (el.scrollTop < 40) onOlder?.();
        }}
      >
        {items.map((item) => {
          if (item.type === "day")
            return (
              <div key={item.key} className="day">
                {item.label}
              </div>
            );
          if (item.type === "new")
            return (
              <div key={item.key} className="newline" data-new="">
                New since you last looked
              </div>
            );
          if (item.type === "event") return <SystemLine key={item.key} message={item.message} />;
          return (
            <MessageRun
              key={item.key}
              author={item.author}
              time={item.time}
              onOpenAuthor={onOpenAuthor}
            >
              {item.messages.map((message) => (
                <Message
                  key={message.id}
                  message={message}
                  timeZone={clock.timeZone}
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
        })}
        <TypingLine names={typing} />
      </div>
      <button
        type="button"
        className={`jump${far ? " on" : ""}`}
        tabIndex={far ? 0 : -1}
        onClick={toBottom}
      >
        <Icon name="down" />
        Jump to latest
      </button>
    </>
  );
}
