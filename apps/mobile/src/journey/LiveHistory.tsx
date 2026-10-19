import { api } from "@q9chat/convex";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  ScrollView,
  View,
  type LayoutRectangle,
  type ViewInstance,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewInstance,
} from "react-native";

import { PillButton } from "../kit/Buttons";
import { noop } from "../kit/noop";
import { TimelineRow, UnreadDivider, JumpToLatest, type GroupActions } from "../kit/Timeline";
import { config } from "../session/config";
import { T } from "../theme/Text";
import { eventItems } from "./groupEvents";
import {
  historyItem,
  openingOffset,
  pageOf,
  slideWindow,
  visibleSequence,
  historyDay,
  typingLabel,
  followAfterScroll,
  messageBounds,
} from "./historyRows";
import { useHistoryPages } from "./useHistoryPages";
import { useReadMessages } from "./useReadMessages";
import { useToday } from "./useToday";

type Group = Extract<NonNullable<FunctionReturnType<typeof api.groups.get>>, { status: "member" }>;
const READ_ONLY: GroupActions = {
  readOnly: true,
  tappedId: null,
  playingId: null,
  playProgress: 0,
  poppedReaction: null,
  onToggleTime: noop,
  onOpenSheet: noop,
  onRetry: noop,
  onQuotePress: noop,
  onReactionPress: noop,
  onReactionLongPress: noop,
  onTogglePlay: noop,
  onAuthorPress: noop,
};

function IncomingTyping({ groupId }: { groupId: Group["groupId"] }) {
  const typing = useQuery(api.typing.list, { groupId });
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const expiry = typing
      ?.filter((person) => person.expiresAt > now)
      .map((person) => person.expiresAt);
    if (!expiry?.length) return () => {};
    const timer = setTimeout(
      () => setNow(Date.now()),
      Math.max(0, Math.min(...expiry) - Date.now()) + 1,
    );
    return () => clearTimeout(timer);
  }, [typing, now]);
  const names =
    typing?.filter((person) => person.expiresAt > now).map((person) => person.name) ?? [];
  const text = typingLabel(names);
  return text ? (
    <T size={12} color="mu" style={{ padding: 12 }} accessibilityLiveRegion="polite">
      {text}
    </T>
  ) : null;
}

type ViewportState = {
  metrics: { offset: number; height: number; content: number };
  lastScrollOffset: number;
  placed: boolean;
  following: boolean;
  anchor: { id: string; offset: number } | null;
  jump: boolean;
  published: { away: boolean; visible: number };
};

/** A bounded live window. Opening snapshots the private unread boundary, not the badge count. */
export function LiveHistory({ group }: { group: Group }) {
  const today = useToday();
  const [opening] = useState(() => ({
    unread: group.firstUnreadSequence,
    read: group.lastReadSequence,
  }));
  const { window, setWindow, rows, loading, failed } = useHistoryPages(group, opening.unread);
  const latest = pageOf(group.lastSequence);
  const scroll = useRef<ScrollViewInstance>(null);
  const boxes = useRowBoxes(rows);
  const contentBoxes = useRowBoxes(rows);
  const viewport = useRef<ViewportState>({
    metrics: { offset: 0, height: 0, content: 0 },
    lastScrollOffset: 0,
    placed: false,
    following: opening.unread === null,
    anchor: null,
    jump: false,
    published: { away: false, visible: 0 },
  });
  const [tappedId, setTappedId] = useState<string | null>(null);
  const [away, setAway] = useState(false);
  const [visible, setVisible] = useState(0);
  const read = useReadMessages(group.groupId, opening.read, visible);
  const resetAnnouncements = useLiveAnnouncements(rows, group.lastSequence, read.visible);
  function measureVisible() {
    if (!viewport.current.placed || loading) return;
    const m = viewport.current.metrics;
    const next = visibleSequence(rows, contentBoxes.current, m.offset, m.height);
    if (next === viewport.current.published.visible) return;
    viewport.current.published.visible = next;
    setVisible(next);
  }
  function saveAnchor() {
    const m = viewport.current.metrics;
    const row = rows.find((candidate) => {
      const box = boxes.current.get(candidate.id);
      return box && box.y + box.height > m.offset;
    });
    const box = row ? boxes.current.get(row.id) : null;
    viewport.current.anchor = row && box ? { id: row.id, offset: box.y - m.offset } : null;
  }
  function endMeasured() {
    const end = rows.at(-1);
    if (!end) return true;
    const box = boxes.current.get(end.id);
    return box !== undefined && box.y + box.height <= viewport.current.metrics.content + 1;
  }
  function place() {
    const m = viewport.current.metrics;
    if (loading || !m.height || !m.content || !endMeasured()) return;
    const y = targetOffset({
      jump: viewport.current.jump,
      placed: viewport.current.placed,
      following: viewport.current.following,
      unread: opening.unread,
      anchor: viewport.current.anchor,
      rows,
      boxes: boxes.current,
      bottom: Math.max(0, m.content - m.height),
    });
    if (y !== null) {
      m.offset = Math.max(0, Math.min(y, m.content - m.height));
      scroll.current?.scrollTo({ y: m.offset, animated: false });
      viewport.current.placed = true;
      viewport.current.jump = false;
      viewport.current.anchor = null;
      viewport.current.following = window.last >= latest && m.content - m.offset - m.height <= 2;
      updateAway();
      measureVisible();
    }
  }
  useEffect(() => {
    // This synchronizes the subscription window with the live server tail, not derived UI state.
    if (viewport.current.following && latest > window.last && !loading) {
      viewport.current.jump = true;
      // oxlint-disable-next-line react/set-state-in-effect -- replace live subscriptions when the server tail moves to a new page
      setWindow({ first: Math.max(0, latest - 2), last: latest });
    }
  }, [latest, loading, window.last, setWindow]);
  function navigate(direction: "older" | "newer") {
    resetAnnouncements(group.lastSequence);
    if (loading) return;
    saveAnchor();
    viewport.current.following = false;
    setWindow(slideWindow(window.first, window.last, direction));
  }
  function toLatest() {
    resetAnnouncements(group.lastSequence);
    viewport.current.jump = true;
    viewport.current.following = true;
    if (window.last !== latest) setWindow({ first: Math.max(0, latest - 2), last: latest });
    else place();
  }
  function updateAway() {
    const m = viewport.current.metrics;
    const next = m.content - m.offset - m.height > 240;
    if (next === viewport.current.published.away) return;
    viewport.current.published.away = next;
    setAway(next);
  }
  function onScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const m = viewport.current.metrics;
    m.offset = event.nativeEvent.contentOffset.y;
    viewport.current.following = followAfterScroll(
      viewport.current.following,
      viewport.current.lastScrollOffset,
      m.offset,
      window.last >= latest && m.content - m.offset - m.height <= 2,
    );
    viewport.current.lastScrollOffset = m.offset;
    updateAway();
    saveAnchor();
    measureVisible();
  }
  function toggleTime(id: string) {
    setTappedId((value) => (value === id ? null : id));
  }
  function onRowLayout(id: string, box: LayoutRectangle) {
    boxes.current.set(id, box);
    if (id === rows.at(-1)?.id) place();
  }
  return (
    <View style={{ flex: 1 }}>
      <HistoryStatus error={read.error} retry={read.retry} failed={failed} />
      <View style={{ flex: 1 }}>
        <ScrollView
          ref={scroll}
          accessibilityLabel="Messages"
          scrollEventThrottle={100}
          onLayout={(event) => {
            viewport.current.metrics.height = event.nativeEvent.layout.height;
            place();
          }}
          onContentSizeChange={(_, height) => {
            viewport.current.metrics.content = height;
            place();
          }}
          onScroll={onScroll}
          contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 12 }}
        >
          <HistoryPage
            group={group}
            rows={rows}
            paging={{ window, latest, loading, navigate }}
            unread={opening.unread}
            today={today}
            actions={{ ...READ_ONLY, tappedId, onToggleTime: toggleTime }}
            onRowLayout={onRowLayout}
            onContentLayout={(id, box) => {
              contentBoxes.current.set(id, box);
              measureVisible();
            }}
          />
        </ScrollView>
        <JumpControl shown={away || window.last < latest} onPress={toLatest} />
      </View>
      <IncomingTyping groupId={group.groupId} />
    </View>
  );
}

type HistoryPageProps = {
  group: Group;
  rows: ReturnType<typeof useHistoryPages>["rows"];
  paging: {
    window: { first: number; last: number };
    latest: number;
    loading: boolean;
    navigate: (direction: "older" | "newer") => void;
  };
  unread: number | null;
  today: ReturnType<typeof useToday>;
  actions: GroupActions;
  onRowLayout: (id: string, box: LayoutRectangle) => void;
  onContentLayout: (id: string, box: { y: number; height: number }) => void;
};

function HistoryPage(props: HistoryPageProps) {
  const { group, rows, paging } = props;
  return (
    <>
      {paging.window.first > 0 ? <PageButton paging={paging} direction="older" /> : null}
      {paging.window.first === 0 && group.kind === "pair"
        ? eventItems("pair", group.partner, []).map((item) => (
            <TimelineRow key={item.id} item={item} first actions={READ_ONLY} />
          ))
        : null}
      {!rows.length ? (
        <T color="mu">{paging.loading ? "Loading messages…" : "No messages yet"}</T>
      ) : null}
      <HistoryPosts {...props} />
      {paging.window.last < paging.latest ? <PageButton paging={paging} direction="newer" /> : null}
    </>
  );
}

function HistoryPosts(props: HistoryPageProps) {
  return (
    <>
      {/* react-doctor-disable-next-line react-doctor/rn-no-scrollview-mapped-list -- at most 300 sequences; measured row identity keeps the reading anchor stable while paging */}
      {props.rows.map((row, index) => (
        <HistoryPost key={row.id} row={row} index={index} page={props} />
      ))}
    </>
  );
}

function HistoryPost({
  row,
  index,
  page,
}: {
  row: HistoryPageProps["rows"][number];
  index: number;
  page: HistoryPageProps;
}) {
  const { rows, group, today, unread, actions, onRowLayout, onContentLayout } = page;
  const root = useRef<ViewInstance>(null);
  const measured = useRef<{ row: LayoutRectangle | null; content: ViewInstance | null }>({
    row: null,
    content: null,
  });
  function measure(node: ViewInstance) {
    measured.current.content = node;
    const parent = root.current;
    if (!parent) return;
    node.measureLayout(parent, (_, y, _width, height) => {
      const box = measured.current.row;
      if (box && measured.current.content === node)
        onContentLayout(row.id, messageBounds(box, { y, height }));
    });
  }
  return (
    <View
      ref={root}
      collapsable={false}
      onLayout={(event) => {
        measured.current.row = event.nativeEvent.layout;
        onRowLayout(row.id, event.nativeEvent.layout);
        if (measured.current.content) measure(measured.current.content);
      }}
    >
      {index === 0 ||
      new Date(rows[index - 1]?.createdAt ?? 0).toDateString() !==
        new Date(row.createdAt).toDateString() ? (
        <T size={12} color="mu" style={{ alignSelf: "center", marginTop: 16 }}>
          {historyDay(row.createdAt, today)}
        </T>
      ) : null}
      {row.sequence === unread ? <UnreadDivider /> : null}
      <TimelineRow
        item={historyItem(row, config.siteUrl, {
          members: group.members,
          previous: rows[index - 1],
          unread,
        })}
        first={index === 0}
        actions={{ ...actions, onContentLayout: (_, node) => measure(node) }}
      />
    </View>
  );
}

function PageButton({
  paging,
  direction,
}: {
  paging: HistoryPageProps["paging"];
  direction: "older" | "newer";
}) {
  const label = direction === "older" ? "Load older messages" : "Load newer messages";
  return (
    <PillButton
      label={paging.loading ? "Loading messages…" : label}
      onPress={() => paging.navigate(direction)}
      disabled={paging.loading}
    />
  );
}

function useLiveAnnouncements(
  rows: HistoryPageProps["rows"],
  initialSequence: number,
  visible: boolean,
) {
  const announced = useRef(initialSequence);
  useEffect(() => {
    const arrivals = rows.filter(
      (row) => row.sequence > announced.current && row.kind !== "event" && !row.author.isYou,
    );
    for (const row of rows) announced.current = Math.max(announced.current, row.sequence);
    if (arrivals.length && visible)
      AccessibilityInfo.announceForAccessibility(
        arrivals.length === 1 ? "New message" : `${arrivals.length} new messages`,
      );
  }, [rows, visible]);

  return (sequence: number) => {
    announced.current = sequence;
  };
}

function useRowBoxes(rows: HistoryPageProps["rows"]) {
  const boxes = useRef(new Map<string, { y: number; height: number }>());
  useEffect(() => {
    const ids = new Set<string>(rows.map((row) => row.id));
    for (const id of boxes.current.keys()) if (!ids.has(id)) boxes.current.delete(id);
  }, [rows]);
  return boxes;
}

function targetOffset(input: {
  jump: boolean;
  placed: boolean;
  following: boolean;
  unread: number | null;
  anchor: { id: string; offset: number } | null;
  rows: HistoryPageProps["rows"];
  boxes: ReadonlyMap<string, { y: number; height: number }>;
  bottom: number;
}) {
  if (input.jump || (input.placed && input.following)) return input.bottom;
  if (!input.placed) return openingOffset(input.unread, input.rows, input.boxes, input.bottom);
  if (!input.anchor) return null;
  const box = input.boxes.get(input.anchor.id);
  return box ? box.y - input.anchor.offset : null;
}

function HistoryStatus({
  error,
  retry,
  failed,
}: {
  error: string;
  retry: () => void;
  failed: boolean;
}) {
  return (
    <>
      {error ? <PillButton label={error} onPress={retry} /> : null}
      {failed ? <T color="er">Couldn't load messages. Go back and try again.</T> : null}
    </>
  );
}

function JumpControl({ shown, onPress }: { shown: boolean; onPress: () => void }) {
  if (!shown) return null;
  return (
    <View style={{ position: "absolute", end: 24, bottom: 16 }}>
      <JumpToLatest onPress={onPress} />
    </View>
  );
}
