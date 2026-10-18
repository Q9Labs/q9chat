import { useEffect, useRef, useState } from "react";
import {
  Animated,
  ScrollView,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewInstance,
} from "react-native";

import { useTheme } from "../theme";
import { T } from "../theme/Text";
import { motion } from "../theme/tokens";
import type { Emoji, Message, Person, TimelineItem } from "../types";
import { Avatar } from "./Avatar";
import { keyedByOffset } from "./format";
import { Icon } from "./Icon";
import { MessageBubble } from "./MessageBubble";
import { useEased, useReducedMotion } from "./motion";
import { Press } from "./Press";

function DateSeparator({ label }: { label: string }) {
  return (
    <T size={12} weight={600} color="mu" style={{ alignSelf: "center", marginTop: 24 }}>
      {label}
    </T>
  );
}

/** "New since you last looked": accent text between two faint rules. */
function UnreadDivider() {
  const { c } = useTheme();
  const rule = { flex: 1, height: 1, backgroundColor: c.ac, opacity: 0.22 };
  return (
    <View
      accessibilityRole="header"
      style={{ flexDirection: "row", alignItems: "center", gap: 12, marginTop: 24 }}
    >
      <View style={rule} />
      <T size={12} weight={500} color="ac">
        New since you last looked
      </T>
      <View style={rule} />
    </View>
  );
}

function SystemLine({ segments }: { segments: readonly { text: string; strong: boolean }[] }) {
  return (
    <T size={12} color="mu" style={{ alignSelf: "center", marginTop: 20, textAlign: "center" }}>
      {keyedByOffset(segments, (segment) => segment.text.length).map(({ key, item: segment }) => (
        <T key={key} size={12} color="mu" weight={segment.strong ? 500 : 400}>
          {segment.text}
        </T>
      ))}
    </T>
  );
}

function Dot({ delay }: { delay: number }) {
  const { c } = useTheme();
  const reduced = useReducedMotion();
  const [opacity] = useState(() => new Animated.Value(0.25));
  useEffect(() => {
    const loop = reduced
      ? null
      : Animated.loop(
          Animated.sequence([
            Animated.delay(delay),
            Animated.timing(opacity, { toValue: 1, duration: 480, useNativeDriver: true }),
            Animated.timing(opacity, {
              toValue: 0.25,
              duration: 720 - delay,
              useNativeDriver: true,
            }),
          ]),
        );
    loop?.start();
    return () => loop?.stop();
  }, [delay, opacity, reduced]);
  return (
    <Animated.View
      style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: c.mu, opacity }}
    />
  );
}

/** "Shoaib is typing": the only presence, three blinking dots and a line. */
function TypingLine({ text }: { text: string }) {
  return (
    <View
      accessibilityRole="text"
      accessibilityLiveRegion="polite"
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        marginTop: 12,
        marginLeft: 36,
        minHeight: 18,
      }}
    >
      <View style={{ flexDirection: "row", gap: 3 }} accessibilityElementsHidden>
        <Dot delay={0} />
        <Dot delay={200} />
        <Dot delay={400} />
      </View>
      <T size={12} color="mu" numberOfLines={1} style={{ flexShrink: 1 }}>
        {text}
      </T>
    </View>
  );
}

type GroupActions = {
  tappedId: string | null;
  playingId: string | null;
  playProgress: number;
  poppedReaction: { messageId: string; emoji: Emoji } | null;
  onToggleTime: (messageId: string) => void;
  onOpenSheet: (messageId: string) => void;
  onRetry: (messageId: string) => void;
  onQuotePress: (messageId: string) => void;
  onReactionPress: (messageId: string, emoji: Emoji) => void;
  onReactionLongPress: (messageId: string, emoji: Emoji) => void;
  onTogglePlay: (messageId: string) => void;
  onAuthorPress: (author: Person) => void;
};

type GroupItem = Extract<TimelineItem, { type: "group" }>;

function BubbleOf({ message, actions }: { message: Message; actions: GroupActions }) {
  const playing = actions.playingId === message.id;
  const popped = actions.poppedReaction;
  return (
    <MessageBubble
      message={message}
      showTime={actions.tappedId === message.id}
      onToggleTime={() => actions.onToggleTime(message.id)}
      onOpenSheet={() => actions.onOpenSheet(message.id)}
      onRetry={() => actions.onRetry(message.id)}
      onQuotePress={actions.onQuotePress}
      onReactionPress={(emoji) => actions.onReactionPress(message.id, emoji)}
      onReactionLongPress={(emoji) => actions.onReactionLongPress(message.id, emoji)}
      onTogglePlay={() => actions.onTogglePlay(message.id)}
      playing={playing}
      playProgress={playing ? actions.playProgress : 0}
      poppedEmoji={popped?.messageId === message.id ? popped.emoji : null}
    />
  );
}

/** The name in the person's colour (the lighter one in dark), then the time. */
function GroupHeader({
  item,
  onAuthorPress,
}: {
  item: GroupItem;
  onAuthorPress: (author: Person) => void;
}) {
  const { scheme } = useTheme();
  const { author } = item;
  const person = author.avatar.kind === "person" ? author.avatar : null;
  const nameColor = person ? (scheme === "dark" ? person.colorOnDark : person.color) : "tx";
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "baseline",
        gap: 6,
        marginHorizontal: 4,
        marginBottom: 2,
        maxWidth: "100%",
      }}
    >
      {item.messages[0]?.mine ? null : (
        <Press
          accessibilityRole="button"
          onPress={() => onAuthorPress(author)}
          scaleTo={1}
          style={{ flexShrink: 1 }}
        >
          <T size={13} weight={600} color={nameColor} numberOfLines={1}>
            {author.name}
          </T>
        </Press>
      )}
      <T size={12} color="mu" tabular>
        {item.timeLabel}
      </T>
    </View>
  );
}

/** One name, one avatar and one time per run of messages from one person. */
function MessageGroup({ item, actions }: { item: GroupItem; actions: GroupActions }) {
  const mine = item.messages[0]?.mine ?? false;
  const { author } = item;
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, marginTop: 16 }}>
      {mine ? null : (
        <Press
          accessibilityRole="button"
          accessibilityLabel={`Open your group with ${author.name}`}
          onPress={() => actions.onAuthorPress(author)}
          scaleTo={1}
          style={{ marginTop: 21 }}
        >
          <Avatar avatar={author.avatar} size={28} />
        </Press>
      )}
      <View style={{ flex: 1, minWidth: 0, gap: 2, alignItems: mine ? "flex-end" : "flex-start" }}>
        <GroupHeader item={item} onAuthorPress={actions.onAuthorPress} />
        {item.messages.map((message) => (
          <BubbleOf key={message.id} message={message} actions={actions} />
        ))}
      </View>
    </View>
  );
}

function TimelineRow({ item, actions }: { item: TimelineItem; actions: GroupActions }) {
  if (item.type === "day") return <DateSeparator label={item.label} />;
  if (item.type === "unread") return <UnreadDivider />;
  if (item.type === "system") return <SystemLine segments={item.segments} />;
  return <MessageGroup item={item} actions={actions} />;
}

type TimelineProps = {
  items: readonly TimelineItem[];
  typingText: string | null;
  /** Scrolls to the latest message when this value changes. */
  latestKey: string;
} & GroupActions;

const FAR_FROM_LATEST = 240;
/** The unread divider rests this far under the top of the list when a group opens with unread messages: the mock puts it 90px under its screen top, 67px of which are the header. */
const DIVIDER_INSET = 23;

type Metrics = { viewport: number; content: number; divider: number | null };

const isMeasured = (m: Metrics, hasDivider: boolean) =>
  m.viewport > 0 && m.content > 0 && (!hasDivider || m.divider !== null);

function restingOffset(m: Metrics, hasDivider: boolean): number {
  const max = Math.max(0, m.content - m.viewport);
  if (!hasDivider || m.divider === null) return max;
  return Math.min(max, Math.max(0, m.divider - DIVIDER_INSET));
}

/** The conversation: groups of bubbles, less inside and more between. Opens at the unread divider when there is one, else at the latest message. */
export function Timeline({ items, typingText, latestKey, ...actions }: TimelineProps) {
  const ref = useRef<ScrollViewInstance>(null);
  const [away, setAway] = useState(false);
  const progress = useEased(away ? 1 : 0, motion.scrim);
  const metrics = useRef<Metrics>({ viewport: 0, content: 0, divider: null });
  const placedKey = useRef<string | null>(null);
  const hasDivider = items.some((item) => item.type === "unread");

  const place = () => {
    const m = metrics.current;
    if (placedKey.current === latestKey || !isMeasured(m, hasDivider)) return;
    placedKey.current = latestKey;
    const y = restingOffset(m, hasDivider);
    ref.current?.scrollTo({ y, animated: false });
    setAway(m.content - y - m.viewport > FAR_FROM_LATEST);
  };

  const settle = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    setAway(contentSize.height - contentOffset.y - layoutMeasurement.height > FAR_FROM_LATEST);
  };

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        ref={ref}
        accessibilityLabel="Messages"
        onLayout={(event) => {
          metrics.current.viewport = event.nativeEvent.layout.height;
          place();
        }}
        onScrollEndDrag={settle}
        onMomentumScrollEnd={settle}
        keyboardDismissMode="interactive"
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: "flex-end",
          paddingTop: 4,
          paddingHorizontal: 12,
          paddingBottom: 8,
        }}
        onContentSizeChange={(_, height) => {
          metrics.current.content = height;
          if (placedKey.current !== latestKey) place();
          else if (!away) ref.current?.scrollToEnd({ animated: true });
        }}
      >
        {/* react-doctor-disable-next-line react-doctor/rn-no-scrollview-mapped-list -- the unread divider is placed from measured row layout, which a virtualized list would not give */}
        {items.map((item) =>
          item.type === "unread" ? (
            <View
              key={item.id}
              onLayout={(event) => {
                metrics.current.divider = event.nativeEvent.layout.y;
                place();
              }}
            >
              <UnreadDivider />
            </View>
          ) : (
            <TimelineRow key={item.id} item={item} actions={actions} />
          ),
        )}
        {typingText ? <TypingLine text={typingText} /> : null}
      </ScrollView>
      <Animated.View
        pointerEvents={away ? "auto" : "none"}
        style={{
          position: "absolute",
          end: 24,
          bottom: 16,
          opacity: progress,
          transform: [
            { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) },
          ],
        }}
      >
        <JumpToLatest onPress={() => ref.current?.scrollToEnd({ animated: true })} />
      </Animated.View>
    </View>
  );
}

function JumpToLatest({ onPress }: { onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Press
      accessibilityRole="button"
      accessibilityLabel="Jump to latest"
      onPress={onPress}
      style={{
        height: 36,
        paddingLeft: 12,
        paddingRight: 14,
        borderRadius: 999,
        backgroundColor: c.pop,
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        boxShadow: c.shadow,
      }}
    >
      <Icon name="down" size={16} color="tx" />
      <T size={13} weight={600}>
        Jump to latest
      </T>
    </Press>
  );
}
