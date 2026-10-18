import { api } from "@q9chat/convex";
import { useMutation, useQueries, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useEffect, useMemo, useRef, useState } from "react";

import type { MessageHandlers } from "../chat/message.js";
import { Timeline } from "../chat/timeline-view.js";
import type { Author, MemberEvent, MessageView } from "../chat/types.js";
import { Button } from "../ui/controls.js";
import { Dialog, DialogActions } from "../ui/overlay.js";
import { journeyError } from "./group-errors.js";
import { usePhotos } from "./photos.js";

type Group = Extract<FunctionReturnType<typeof api.groups.get>, { status: "member" }>;
type Row = FunctionReturnType<typeof api.messages.range>[number];
type Person = Group["members"][number];

function author(person: Person, photos: ReadonlyMap<string, string>): Author {
  return {
    ...person,
    avatar: {
      ...person.avatar,
      photoUrl: person.avatar.photo ? (photos.get(person.avatar.photo) ?? null) : null,
    },
  };
}
function eventView(
  event: Extract<Row, { kind: "event" }>["event"],
  photos: ReadonlyMap<string, string>,
): MemberEvent {
  switch (event.type) {
    case "created":
      return { ...event, by: author(event.by, photos) };
    case "added":
      return {
        ...event,
        by: author(event.by, photos),
        people: event.people.map((p) => author(p, photos)),
      };
    case "removed":
      return {
        type: "removed",
        by: author(event.by, photos),
        people: [author(event.person, photos)],
      };
    case "joined":
    case "left":
      return { type: event.type, people: [author(event.person, photos)] };
    default: {
      const unreachable: never = event;
      return unreachable;
    }
  }
}
function messageView(row: Row, group: Group, photos: ReadonlyMap<string, string>): MessageView {
  if (row.kind === "event") return { ...row, event: eventView(row.event, photos) };
  const person = author(row.author, photos);
  if (row.kind === "deleted") return { ...row, author: person };
  const mentionIds = new Set(row.mentions);
  return {
    ...row,
    author: person,
    mentions: group.members.filter((p) => mentionIds.has(p.id)).map((p) => p.name),
    attachments: [],
    attachmentLabels: row.attachments.map((file) => ({
      id: file.url,
      label:
        file.kind === "file"
          ? `${file.name} · ${file.contentType}`
          : `${file.kind === "image" ? "Image" : "Voice note"} · ${file.contentType}`,
    })),
    replyTo:
      row.replyTo === null
        ? null
        : row.replyTo.deleted
          ? row.replyTo
          : { ...row.replyTo, author: author(row.replyTo.author, photos) },
    reactions: row.reactions.map((reaction) => ({ ...reaction, people: [] })),
  };
}
const displayOnly = () => {};
const handlers: MessageHandlers = {
  onReact: displayOnly,
  onReply: displayOnly,
  onEdit: displayOnly,
  onCopy: displayOnly,
  onDelete: displayOnly,
  onReport: displayOnly,
  onRetry: displayOnly,
  onOpenQuote: displayOnly,
  onTogglePlay: displayOnly,
  onMenuOpenChange: displayOnly,
};

function useTyping(group: Group) {
  const rows = useQuery(api.typing.list, { groupId: group.groupId });
  const [now, setNow] = useState(Date.now);
  useEffect((): (() => void) | undefined => {
    const next = rows?.filter((row) => row.expiresAt > now).map((row) => row.expiresAt);
    if (!next?.length) return () => {};
    const timer = window.setTimeout(
      () => setNow(Date.now()),
      Math.max(0, Math.min(...next) - Date.now()) + 1,
    );
    return () => window.clearTimeout(timer);
  }, [rows, now]);
  return (rows ?? [])
    .filter((row) => row.expiresAt > now)
    .map((row) => row.name)
    .toSorted((a, b) => a.localeCompare(b));
}

const HISTORY_PAGE_SIZE = 100;
const MAX_LIVE_HISTORY_PAGES = 3;
interface HistoryWindow {
  readonly first: number;
  readonly last: number;
}
function pageOf(sequence: number) {
  return Math.floor(Math.max(0, sequence - 1) / HISTORY_PAGE_SIZE);
}
function useHistoryRange(group: Group, window: HistoryWindow) {
  const queries = useMemo(
    () =>
      Object.fromEntries(
        Array.from({ length: window.last - window.first + 1 }, (_, index) => {
          const page = window.first + index;
          return [
            // Reuse slots: Convex replaces a slot before adding its new range.
            String(page % MAX_LIVE_HISTORY_PAGES),
            {
              query: api.messages.range,
              args: {
                groupId: group.groupId,
                fromSequence: page * HISTORY_PAGE_SIZE + 1,
                toSequence: (page + 1) * HISTORY_PAGE_SIZE,
              },
            },
          ];
        }),
      ),
    [group.groupId, window.first, window.last],
  );
  const pages: { readonly [page: string]: readonly Row[] | Error | undefined } =
    useQueries(queries);
  return useMemo(() => {
    const rows: Row[] = [];
    let loading = false;
    for (const page of Object.values(pages)) {
      if (page instanceof Error) throw page;
      if (page === undefined) loading = true;
      else rows.push(...page);
    }
    rows.sort((a, b) => a.sequence - b.sequence);
    return { rows, loading };
  }, [pages]);
}

function useRead(group: Group, initial: number, setError: (error: string) => void) {
  const markRead = useMutation(api.readStates.markRead);
  const read = useRef(initial);
  const pending = useRef(false);
  const observed = useRef(initial);
  async function seen(sequence: number) {
    observed.current = Math.max(sequence, observed.current);
    if (pending.current) return;
    pending.current = true;
    try {
      while (observed.current > read.current) {
        const next = observed.current;
        await markRead({ groupId: group.groupId, sequence: next });
        read.current = next;
      }
    } catch (cause) {
      setError(journeyError(cause));
    } finally {
      pending.current = false;
    }
  }
  return seen;
}

function historyMessages(
  rows: readonly Row[],
  group: Group,
  photos: ReadonlyMap<string, string>,
  start: number,
  openedAt: number,
) {
  const messages = rows.map((row) => messageView(row, group, photos));
  if (group.kind === "pair" && start === 1 && group.partner)
    messages.unshift({
      kind: "event",
      id: "pair-start",
      sequence: 0,
      createdAt: rows[0]?.createdAt ?? openedAt,
      event: { type: "start", people: [author(group.partner, photos)] },
    });
  return messages;
}

function HistoryAuthor({
  person,
  onClose,
  onMessage,
}: {
  readonly person: Person | null;
  readonly onClose: () => void;
  readonly onMessage: (id: Person["id"]) => void;
}) {
  if (!person) return null;
  return (
    <Dialog label={person.fullName} onClose={onClose}>
      <h3>{person.fullName}</h3>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
        {person.isYou || person.deleted ? null : (
          <Button
            variant="solid"
            onClick={() => {
              onMessage(person.id);
              onClose();
            }}
          >
            Message
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}

function findAuthor(rows: readonly Row[], id: string) {
  for (const row of rows) {
    if (row.kind !== "event" && row.author.id === id) return row.author;
  }
  return null;
}

interface Opening {
  readonly read: number;
  readonly latest: number;
  readonly at: number;
}

function useOpeningBoundary(range: ReturnType<typeof useHistoryRange>, opened: Opening) {
  const [boundary, setBoundary] = useState<number | null>();
  if (range.loading || boundary !== undefined) return boundary;
  const incoming = range.rows.find(
    (row) =>
      row.sequence > opened.read &&
      row.sequence <= opened.latest &&
      row.kind !== "event" &&
      !row.author.isYou,
  );
  if (incoming) {
    setBoundary(incoming.sequence);
    return incoming.sequence;
  }
  if ((range.rows.at(-1)?.sequence ?? 0) >= opened.latest) {
    setBoundary(null);
    return null;
  }
  return boundary;
}

function initialWindow(opened: Opening): HistoryWindow {
  const page = pageOf(Math.min(opened.read + 1, opened.latest));
  return { first: Math.max(0, page - 1), last: Math.min(pageOf(opened.latest), page + 1) };
}
function moveWindow(
  window: HistoryWindow,
  direction: "older" | "newer",
  latestPage: number,
): HistoryWindow {
  return direction === "older"
    ? {
        first: Math.max(0, window.first - 1),
        last: Math.min(window.last, Math.max(0, window.first - 1) + MAX_LIVE_HISTORY_PAGES - 1),
      }
    : {
        first: Math.max(window.first, window.last + 2 - MAX_LIVE_HISTORY_PAGES),
        last: Math.min(latestPage, window.last + 1),
      };
}
function sequenceInWindow(rows: readonly Row[], boundary: number | null | undefined) {
  return boundary !== undefined &&
    boundary !== null &&
    rows.some((row) => row.sequence === boundary)
    ? boundary
    : null;
}
function useLoadedRows(range: ReturnType<typeof useHistoryRange>) {
  // Keep the current DOM until a replacement page is ready, so its visible anchor survives.
  const [display, setDisplay] = useState<readonly Row[] | null>(null);
  if (!range.loading && display !== range.rows) setDisplay(range.rows);
  return display;
}
function historyControls({
  window,
  latestPage,
  loading,
  setWindow,
}: {
  readonly window: HistoryWindow;
  readonly latestPage: number;
  readonly loading: boolean;
  readonly setWindow: (window: HistoryWindow) => void;
}) {
  const changePage = (direction: "older" | "newer") => {
    if (!loading) setWindow(moveWindow(window, direction, latestPage));
  };
  return {
    older: window.first > 0 ? () => changePage("older") : undefined,
    newer: window.last < latestPage ? () => changePage("newer") : undefined,
    latest: () => setWindow({ first: Math.max(0, latestPage - 1), last: latestPage }),
  };
}
function useHistory(group: Group, opened: Opening) {
  const latestPage = pageOf(group.lastSequence);
  const [window, setWindow] = useState(() => initialWindow(opened));
  const [atBottom, setAtBottom] = useState(false);
  const [previousLatest, setPreviousLatest] = useState(latestPage);
  if (previousLatest !== latestPage) {
    setPreviousLatest(latestPage);
    if (atBottom && window.last >= previousLatest)
      setWindow({
        first: Math.max(window.first, latestPage - MAX_LIVE_HISTORY_PAGES + 1),
        last: latestPage,
      });
  }
  const range = useHistoryRange(group, window);
  const display = useLoadedRows(range);
  const rows = display ?? [];
  const boundary = useOpeningBoundary(range, opened);
  if (!range.loading && boundary === undefined)
    setWindow({ first: window.last + 1, last: window.last + 1 });
  return {
    rows,
    loading: range.loading,
    ready: boundary !== undefined,
    start: window.first * HISTORY_PAGE_SIZE + 1,
    sequence: sequenceInWindow(rows, boundary),
    ...historyControls({ window, latestPage, loading: range.loading, setWindow }),
    setAtBottom,
  };
}

function historyPhotoPaths(rows: readonly Row[]) {
  return rows.flatMap((row) => {
    if (row.kind === "event") return [];
    return row.author.avatar.photo ? [row.author.avatar.photo] : [];
  });
}

export function History({
  group,
  onMessage,
}: {
  readonly group: Group;
  readonly onMessage: (id: Person["id"]) => void;
}) {
  const [opened] = useState(() => ({
    read: group.lastReadSequence,
    latest: group.lastSequence,
    at: Date.now(),
  }));
  const {
    rows,
    loading,
    start,
    older,
    newer,
    latest,
    setAtBottom,
    ready,
    sequence: newFromSequence,
  } = useHistory(group, opened);
  const [selectedAuthor, setAuthor] = useState<Person | null>(null);
  const [error, setError] = useState("");
  const { photos } = usePhotos(historyPhotoPaths(rows), setError);
  const typing = useTyping(group);
  const seen = useRead(group, opened.read, setError);
  const messages = historyMessages(rows, group, photos, start, opened.at);
  return (
    <>
      {error ? <p role="alert">{error}</p> : null}
      {ready && (rows.length || !loading) ? (
        <Timeline
          messages={messages}
          newFromSequence={newFromSequence}
          typing={typing}
          handlers={handlers}
          onOpenAuthor={(person) => setAuthor(findAuthor(rows, person.id))}
          menuMessageId={null}
          highlightId={null}
          playing={null}
          readOnly
          reading={{
            onVisible: (sequence) => void seen(sequence),
            onOlder: older,
            onNewer: newer,
            onLatest: latest,
            onAtBottom: setAtBottom,
            loading,
          }}
        />
      ) : null}
      <HistoryComposer title={group.title} />
      <HistoryAuthor
        person={selectedAuthor}
        onClose={() => setAuthor(null)}
        onMessage={onMessage}
      />
    </>
  );
}

function HistoryComposer({ title }: { readonly title: string }) {
  const name = title.length > 28 ? `${title.slice(0, 27)}…` : title;
  return (
    <div className="composer">
      <div className="field">
        <textarea aria-label="Message" rows={1} placeholder={`Message ${name}`} disabled />
      </div>
    </div>
  );
}
