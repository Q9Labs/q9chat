import { api } from "@q9chat/convex";
import { useMutation, useQueries, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useEffect, useMemo, useRef, useState } from "react";

import type { MessageHandlers } from "../chat/message.js";
import { Timeline } from "../chat/timeline-view.js";
import type { Author, MemberEvent, MessageView } from "../chat/types.js";
import { Button } from "../ui/controls.js";
import { Dialog, DialogActions } from "../ui/overlay.js";
import { useArrivalAnnouncement } from "./arrival-announcement.js";
import { journeyError } from "./group-errors.js";
import { usePhotos } from "./photos.js";
import { useSenderTyping } from "./sender-typing.js";
import { TextComposer } from "./text-composer.js";
import { useTextOutbox } from "./text-outbox.js";

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
    renderKey: row.author.isYou ? row.clientKey : row.id,
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

function useRead(
  group: Group,
  initial: number,
  options: {
    readonly setError: (error: string) => void;
    readonly covered: boolean;
    readonly authorOpen: boolean;
  },
) {
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
      options.setError(journeyError(cause));
    } finally {
      pending.current = false;
    }
  }
  return options.covered || options.authorOpen
    ? undefined
    : (sequence: number) => void seen(sequence);
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
  readonly firstUnread: number | null;
}

function initialWindow(opened: Opening): HistoryWindow {
  const page = pageOf(opened.firstUnread ?? opened.latest);
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
function containsSequence(window: HistoryWindow, sequence: number) {
  return pageOf(sequence) >= window.first && pageOf(sequence) <= window.last;
}
function sameWindow(left: HistoryWindow, right: HistoryWindow) {
  return left.first === right.first && left.last === right.last;
}
function useLoadedRows(
  range: ReturnType<typeof useHistoryRange>,
  window: HistoryWindow,
  anchor: number | null,
  replacement: boolean,
) {
  // Retain the DOM until a ready destination contains the reader's current anchor.
  const [display, setDisplay] = useState<{
    readonly rows: readonly Row[];
    readonly window: HistoryWindow;
  } | null>(null);
  const allowed = replacement || anchor === null || containsSequence(window, anchor);
  if (!range.loading && allowed && display?.rows !== range.rows)
    setDisplay({ rows: range.rows, window });
  return display;
}
function historyControls({
  window,
  latestPage,
  loading,
  setWindow,
  onNavigate,
}: {
  readonly window: HistoryWindow;
  readonly latestPage: number;
  readonly loading: boolean;
  readonly setWindow: (window: HistoryWindow) => void;
  readonly onNavigate: (replacement: boolean) => void;
}) {
  const changePage = (direction: "older" | "newer") => {
    if (!loading) {
      onNavigate(false);
      setWindow(moveWindow(window, direction, latestPage));
    }
  };
  return {
    older: window.first > 0 ? () => changePage("older") : undefined,
    newer: window.last < latestPage ? () => changePage("newer") : undefined,
    latest: () => {
      onNavigate(true);
      setWindow({ first: Math.max(0, latestPage - 1), last: latestPage });
    },
  };
}
function retainedWindow(
  display: ReturnType<typeof useLoadedRows>,
  requested: HistoryWindow,
  anchor: number | null,
  replace: boolean,
) {
  if (!display || replace || anchor === null || containsSequence(requested, anchor)) return null;
  return sameWindow(requested, display.window) ? null : display.window;
}
function followsLatest(window: HistoryWindow, latestPage: number, atBottom: boolean) {
  return atBottom && window.last === latestPage;
}
function displayedHistory(display: ReturnType<typeof useLoadedRows>, window: HistoryWindow) {
  return {
    rows: display?.rows ?? [],
    start: (display?.window.first ?? window.first) * HISTORY_PAGE_SIZE + 1,
  };
}
function canFollowLatest(window: HistoryWindow, previousLatest: number, atBottom: boolean) {
  return atBottom && window.last >= previousLatest;
}
function useHistory(group: Group, opened: Opening) {
  const latestPage = pageOf(group.lastSequence);
  const [window, setWindow] = useState(() => initialWindow(opened));
  const [atBottom, setAtBottom] = useState(false);
  const [anchor, setAnchor] = useState<number | null>(null);
  const [replacement, setReplacement] = useState(false);
  const [navigation, setNavigation] = useState(0);
  const [previousLatest, setPreviousLatest] = useState(latestPage);
  if (previousLatest !== latestPage) {
    setPreviousLatest(latestPage);
    if (canFollowLatest(window, previousLatest, atBottom))
      setWindow({
        first: Math.max(window.first, latestPage - MAX_LIVE_HISTORY_PAGES + 1),
        last: latestPage,
      });
  }
  const range = useHistoryRange(group, window);
  const replace = replacement || followsLatest(window, latestPage, atBottom);
  const display = useLoadedRows(range, window, anchor, replace);
  const { rows, start } = displayedHistory(display, window);
  if (replacement && !range.loading) setReplacement(false);
  const retained = retainedWindow(display, window, anchor, replace);
  if (retained) setWindow(retained);
  return {
    rows,
    loading: range.loading,
    start,
    atLatest: window.last >= latestPage,
    sequence: sequenceInWindow(rows, opened.firstUnread),
    ...historyControls({
      window,
      latestPage,
      loading: range.loading,
      setWindow,
      onNavigate: (intentionalReplacement) => {
        setReplacement(intentionalReplacement);
        setNavigation((value) => value + 1);
      },
    }),
    setAtBottom,
    setAnchor,
    navigation,
  };
}

function historyPhotoPaths(rows: readonly Row[]) {
  return rows.flatMap((row) => {
    if (row.kind === "event") return [];
    return row.author.avatar.photo ? [row.author.avatar.photo] : [];
  });
}

function useAuthorSelection(rows: readonly Row[], loading: boolean) {
  const [id, select] = useState<string | null>(null);
  const person = id === null ? null : findAuthor(rows, id);
  if (id !== null && person === null && !loading) select(null);
  return { person, select };
}

export function History({
  group,
  onMessage,
  covered,
}: {
  readonly group: Group;
  readonly covered: boolean;
  readonly onMessage: (id: Person["id"]) => void;
}) {
  const [opened] = useState(() => ({
    read: group.lastReadSequence,
    latest: group.lastSequence,
    at: Date.now(),
    firstUnread: group.firstUnreadSequence,
  }));
  const {
    rows,
    loading,
    start,
    atLatest,
    older,
    newer,
    latest,
    setAtBottom,
    setAnchor,
    navigation,
    sequence: newFromSequence,
  } = useHistory(group, opened);
  const { person: selectedPerson, select: setAuthor } = useAuthorSelection(rows, loading);
  const [error, setError] = useState("");
  const { photos } = usePhotos(historyPhotoPaths(rows), setError);
  const typing = useTyping(group);
  const onVisible = useRead(group, opened.read, {
    setError,
    covered,
    authorOpen: selectedPerson !== null,
  });
  const announcement = useArrivalAnnouncement(rows, group.lastSequence, opened.latest, navigation);
  const outbox = useTextOutbox(group, rows);
  const senderTyping = useSenderTyping(group.groupId);
  const [latestRequest, requestLatest] = useState(0);
  const messages = [
    ...historyMessages(rows, group, photos, start, opened.at),
    ...(atLatest ? outbox.messages : []),
  ];
  function toLatest() {
    latest();
    requestLatest((value) => value + 1);
  }
  function sendText() {
    if (!outbox.submit()) return;
    senderTyping.clear();
    toLatest();
  }
  const issue = [error, outbox.error, senderTyping.error].find(Boolean);
  function changeDraft(value: string) {
    outbox.change(value);
    senderTyping.change(value);
  }
  function retry(message: MessageView) {
    outbox.retry(message.id);
    toLatest();
  }
  return (
    <>
      {issue ? <p role="alert">{issue}</p> : null}
      {rows.length || !loading ? (
        <Timeline
          messages={messages}
          newFromSequence={newFromSequence}
          typing={typing}
          handlers={{
            ...handlers,
            onRetry: retry,
          }}
          onOpenAuthor={(person) => setAuthor(person.id)}
          menuMessageId={null}
          highlightId={null}
          playing={null}
          readOnly
          reading={{
            onVisible,
            onAnchor: setAnchor,
            announcement,
            onOlder: older,
            onNewer: newer,
            onLatest: latest,
            onAtBottom: setAtBottom,
            loading,
            latestRequest,
          }}
        />
      ) : (
        <output className="tl" aria-label="Loading messages" />
      )}
      <TextComposer
        title={group.title}
        value={outbox.draft}
        onChange={changeDraft}
        onSend={sendText}
        onBlur={senderTyping.clear}
      />
      <HistoryAuthor
        person={selectedPerson}
        onClose={() => setAuthor(null)}
        onMessage={onMessage}
      />
    </>
  );
}
