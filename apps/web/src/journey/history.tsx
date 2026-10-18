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

function useHistoryRange(group: Group, latest: number, start: number) {
  const queries = useMemo(() => {
    const anchor = Math.max(1, latest - 99);
    const ranges: { fromSequence: number; toSequence: number }[] = [];
    for (let from = anchor; from <= Math.max(1, group.lastSequence); from += 100)
      ranges.push({ fromSequence: from, toSequence: from + 99 });
    for (let to = anchor - 1; to >= start; to -= 100)
      ranges.push({ fromSequence: Math.max(1, to - 99), toSequence: to });
    return Object.fromEntries(
      ranges.map((range) => [
        String(range.fromSequence),
        {
          query: api.messages.range,
          args: { groupId: group.groupId, ...range },
        },
      ]),
    );
  }, [group.groupId, group.lastSequence, latest, start]);
  const pages: { readonly [page: string]: readonly Row[] | Error | undefined } =
    useQueries(queries);
  const rows: Row[] = [];
  let loading = false;
  for (const page of Object.values(pages)) {
    if (page instanceof Error) throw page;
    if (page === undefined) loading = true;
    else rows.push(...page);
  }
  rows.sort((a, b) => a.sequence - b.sequence);
  return { rows, loading };
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

function useHistory(group: Group, opened: Opening) {
  const [start, setStart] = useState(() =>
    Math.max(1, Math.min(opened.latest - 99, opened.read + 1)),
  );
  const { rows, loading } = useHistoryRange(group, opened.latest, start);
  const incoming = rows.find(
    (row) =>
      row.sequence > opened.read &&
      row.sequence <= opened.latest &&
      row.kind !== "event" &&
      !row.author.isYou,
  );
  const [ready, setReady] = useState(false);
  if (!loading && !ready) setReady(true);
  const sequence = incoming?.sequence ?? null;
  return { rows, loading, start, setStart, ready, sequence };
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
    setStart,
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
          onVisible={(sequence) => void seen(sequence)}
          onOlder={start > 1 ? () => setStart(Math.max(1, start - 100)) : undefined}
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
