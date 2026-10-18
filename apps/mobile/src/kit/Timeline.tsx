import { useEffect, useRef, useState } from "react";
import { Animated, ScrollView, View, type NativeScrollEvent, type NativeSyntheticEvent, type ScrollViewInstance } from "react-native";
import { useTheme } from "../theme";
import { T } from "../theme/Text";
import { motion } from "../theme/tokens";
import { Avatar } from "./Avatar";
import { Icon } from "./Icon";
import { MessageBubble } from "./MessageBubble";
import { Press } from "./Press";
import { useEased, useReducedMotion } from "./motion";
import type { Emoji, Message, Person, TimelineItem } from "../types";

export function DateSeparator({ label }: { label: string }) {
  return (
    <T size={12} weight={600} color="mu" style={{ alignSelf: "center", marginTop: 24 }}>
      {label}
    </T>
  );
}

/** "New since you last looked": accent text between two faint rules. */
export function UnreadDivider() {
  const { c } = useTheme();
  const rule = { flex: 1, height: 1, backgroundColor: c.ac, opacity: 0.22 };
  return (
    <View accessibilityRole="header" style={{ flexDirection: "row", alignItems: "center", gap: 12, marginTop: 24 }}>
      <View style={rule} />
      <T size={12} weight={500} color="ac">
        New since you last looked
      </T>
      <View style={rule} />
    </View>
  );
}

export function SystemLine({ segments }: { segments: readonly { text: string; strong: boolean }[] }) {
  return (
    <T size={12} color="mu" style={{ alignSelf: "center", marginTop: 20, textAlign: "center" }}>
      {segments.map((segment, index) => (
        <T key={index} size={12} color="mu" weight={segment.strong ? 500 : 400}>
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
            Animated.timing(opacity, { toValue: 0.25, duration: 720 - delay, useNativeDriver: true }),
          ]),
        );
    loop?.start();
    return () => loop?.stop();
  }, [delay, opacity, reduced]);
  return <Animated.View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: c.mu, opacity }} />;
}

/** "Shoaib is typing": the only presence, three blinking dots and a line. */
export function TypingLine({ text }: { text: string }) {
  return (
    <View accessibilityRole="text" accessibilityLiveRegion="polite" style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12, marginLeft: 36, minHeight: 18 }}>
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

/** One name, one avatar and one time per run of messages from one person. */
function MessageGroup({ item, actions }: { item: Extract<TimelineItem, { type: "group" }>; actions: GroupActions }) {
  const { scheme } = useTheme();
  const mine = item.messages[0]?.mine ?? false;
  const author = item.author;
  const nameColor = author.avatar.kind === "person" ? (scheme === "dark" ? author.avatar.colorOnDark : author.avatar.color) : undefined;
  const bubble = (message: Message) => (
    <MessageBubble
      key={message.id}
      message={message}
      showTime={actions.tappedId === message.id}
      onToggleTime={() => actions.onToggleTime(message.id)}
      onOpenSheet={() => actions.onOpenSheet(message.id)}
      onRetry={() => actions.onRetry(message.id)}
      onQuotePress={actions.onQuotePress}
      onReactionPress={(emoji) => actions.onReactionPress(message.id, emoji)}
      onReactionLongPress={(emoji) => actions.onReactionLongPress(message.id, emoji)}
      onTogglePlay={() => actions.onTogglePlay(message.id)}
      playing={actions.playingId === message.id}
      playProgress={actions.playingId === message.id ? actions.playProgress : 0}
      {...(actions.poppedReaction?.messageId === message.id ? { poppedEmoji: actions.poppedReaction.emoji } : {})}
    />
  );
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
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6, marginHorizontal: 4, marginBottom: 2, maxWidth: "100%" }}>
          {mine ? null : (
            <Press accessibilityRole="button" onPress={() => actions.onAuthorPress(author)} scaleTo={1} style={{ flexShrink: 1 }}>
              <T size={13} weight={600} color={nameColor ?? "tx"} numberOfLines={1}>
                {author.name}
              </T>
            </Press>
          )}
          <T size={12} color="mu" tabular>
            {item.timeLabel}
          </T>
        </View>
        {item.messages.map(bubble)}
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

/** The conversation: groups of bubbles, less inside and more between. Starts at the latest message. */
export function Timeline({ items, typingText, latestKey, ...actions }: TimelineProps) {
  const ref = useRef<ScrollViewInstance>(null);
  const [away, setAway] = useState(false);
  const progress = useEased(away ? 1 : 0, motion.scrim);
  const first = useRef(true);
  const seenKey = useRef(latestKey);

  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    setAway(contentSize.height - contentOffset.y - layoutMeasurement.height > 240);
  };

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        ref={ref}
        accessibilityLabel="Messages"
        onScroll={onScroll}
        scrollEventThrottle={64}
        keyboardDismissMode="interactive"
        contentContainerStyle={{ flexGrow: 1, justifyContent: "flex-end", paddingTop: 4, paddingHorizontal: 12, paddingBottom: 8 }}
        onContentSizeChange={() => {
          if (!first.current && seenKey.current === latestKey) return;
          ref.current?.scrollToEnd({ animated: !first.current });
          first.current = false;
          seenKey.current = latestKey;
        }}
      >
        {items.map((item) => (
          <TimelineRow key={item.id} item={item} actions={actions} />
        ))}
        {typingText ? <TypingLine text={typingText} /> : null}
      </ScrollView>
      <Animated.View
        pointerEvents={away ? "auto" : "none"}
        style={{
          position: "absolute",
          end: 24,
          bottom: 16,
          opacity: progress,
          transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
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

