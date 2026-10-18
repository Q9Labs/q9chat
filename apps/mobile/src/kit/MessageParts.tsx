import { useState } from "react";
import {
  Image,
  Linking,
  View,
  type AccessibilityActionEvent,
  type AccessibilityActionInfo,
  type LayoutChangeEvent,
} from "react-native";

import { useTheme } from "../theme";
import { T } from "../theme/Text";
import type { Quote, Reaction, Segment } from "../types";
import { PopIn } from "./Controls";
import { formatDuration, isWebUrl, keyedByOffset } from "./format";
import { Icon } from "./Icon";
import { Press } from "./Press";

/** Body text: @mentions in the accent color, links underlined; an http or https link opens on tap. */
export function BodyText({ segments, edited }: { segments: readonly Segment[]; edited?: boolean }) {
  const { c } = useTheme();
  return (
    <T>
      {keyedByOffset(segments, (segment) => segment.text.length).map(({ key, item: segment }) => {
        if (segment.type === "mention") {
          return (
            <T key={key} weight={600} color="ac">
              {segment.text}
            </T>
          );
        }
        if (segment.type === "link") {
          return (
            <T
              key={key}
              accessibilityRole="link"
              onPress={() => {
                if (isWebUrl(segment.text)) void Linking.openURL(segment.text);
              }}
              style={{ textDecorationLine: "underline", textDecorationColor: c.mu }}
            >
              {segment.text}
            </T>
          );
        }
        return segment.text;
      })}
      {edited ? (
        <T size={11.5} color="mu">
          {"  edited"}
        </T>
      ) : null}
    </T>
  );
}

/** A quoted message inside a bubble: a thin accent bar with muted text and no box. */
export function QuoteBar({ quote, onPress }: { quote: Quote; onPress?: () => void }) {
  const { c } = useTheme();
  return (
    <Press
      accessibilityRole="button"
      accessibilityLabel={`Quoted message from ${quote.author}. Go to it.`}
      onPress={onPress}
      scaleTo={1}
      style={{
        maxWidth: 340,
        alignSelf: "flex-start",
        marginTop: 2,
        marginBottom: 6,
        paddingStart: 9,
        borderStartWidth: 2,
        borderStartColor: c.ac,
      }}
    >
      <T size={12} weight={600} color="tx2" lineHeight={16.2}>
        {quote.author}
      </T>
      <T size={13} color="mu" lineHeight={17.55} numberOfLines={1}>
        {quote.summary}
      </T>
    </Press>
  );
}

/** Borderless pills on a soft fill with a count; your own wears the accent wash. */
export function ReactionPills({
  reactions,
  onPress,
  onLongPress,
  poppedEmoji,
}: {
  reactions: readonly Reaction[];
  onPress?: (emoji: Reaction["emoji"]) => void;
  onLongPress?: (emoji: Reaction["emoji"]) => void;
  poppedEmoji?: Reaction["emoji"];
}) {
  const { c } = useTheme();
  if (!reactions.length) return null;
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
      {reactions.map((reaction) => (
        <PopIn key={reaction.emoji} active={poppedEmoji === reaction.emoji}>
          <Press
            accessibilityRole="button"
            accessibilityLabel={`${reaction.emoji} ${reaction.count}: ${reaction.who}`}
            accessibilityState={{ selected: reaction.mine }}
            onPress={() => onPress?.(reaction.emoji)}
            onLongPress={() => onLongPress?.(reaction.emoji)}
            delayLongPress={480}
            scaleTo={0.94}
            style={{
              minHeight: 26,
              paddingStart: 7,
              paddingEnd: 9,
              borderRadius: 999,
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              backgroundColor: reaction.mine ? c.acw : c.s1,
            }}
          >
            <T size={14} lineHeight={14} capped>
              {reaction.emoji}
            </T>
            <T size={12} weight={600} tabular capped color={reaction.mine ? "ac" : "mu"}>
              {String(reaction.count)}
            </T>
          </Press>
        </PopIn>
      ))}
    </View>
  );
}

export function FileCard({ name, size }: { name: string; size: string }) {
  const { c } = useTheme();
  return (
    <View
      style={{
        width: 260,
        maxWidth: "100%",
        minHeight: 56,
        paddingVertical: 8,
        paddingStart: 10,
        paddingEnd: 14,
        borderRadius: 14,
        backgroundColor: c.s1,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
      }}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          backgroundColor: c.s0,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon name="file" size={18} color="mu" />
      </View>
      <View style={{ flexShrink: 1 }}>
        <T weight={600} numberOfLines={1}>
          {name}
        </T>
        <T size={12} color="mu" tabular>
          {size}
        </T>
      </View>
    </View>
  );
}

const WAVE_MIN = 4;
const WAVE_RANGE = 20;

export function Waveform({
  samples,
  progress = 0,
  height = 26,
}: {
  samples: readonly number[];
  progress?: number;
  height?: number;
}) {
  const { c } = useTheme();
  return (
    <View
      style={{ flex: 1, height, flexDirection: "row", alignItems: "center", gap: 2, minWidth: 0 }}
      accessibilityElementsHidden
    >
      {keyedByOffset(samples, () => 1).map(({ key: index, item: sample }) => (
        <View
          key={index}
          style={{
            flex: 1,
            height: Math.max(WAVE_MIN, WAVE_MIN + sample * WAVE_RANGE),
            borderRadius: 2,
            backgroundColor: index / samples.length < progress ? c.tx : c.mu,
            opacity: index / samples.length < progress ? 1 : 0.45,
          }}
        />
      ))}
    </View>
  );
}

export function VoiceNote({
  durationSeconds,
  waveform,
  playing,
  progress = 0,
  onTogglePlay,
  accessibilityActions,
  onAccessibilityAction,
}: {
  durationSeconds: number;
  waveform: readonly number[];
  playing?: boolean;
  progress?: number;
  onTogglePlay?: () => void;
  accessibilityActions?: AccessibilityActionInfo[];
  onAccessibilityAction?: (event: AccessibilityActionEvent) => void;
}) {
  const { c } = useTheme();
  return (
    <View
      style={{
        width: 280,
        maxWidth: "100%",
        borderRadius: 18,
        backgroundColor: c.s1,
        paddingVertical: 6,
        paddingStart: 6,
        paddingEnd: 14,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
      }}
    >
      <Press
        accessibilityRole="button"
        accessibilityLabel={playing ? "Pause voice note" : "Play voice note"}
        accessibilityActions={accessibilityActions}
        onAccessibilityAction={onAccessibilityAction}
        onPress={onTogglePlay}
        style={{
          width: 32,
          height: 32,
          borderRadius: 16,
          backgroundColor: c.tx,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon name={playing ? "pause" : "play"} size={12} color="s0" />
      </Press>
      <Waveform samples={waveform} progress={progress} />
      <T size={12} color="mu" tabular style={{ minWidth: 30, textAlign: "right" }}>
        {formatDuration(playing ? Math.floor(durationSeconds * progress) : durationSeconds)}
      </T>
    </View>
  );
}

// The eight avatar colors with the mock's sample initials, used for the placeholder photo.
const SAMPLE_TILES = [
  { initials: "HS", color: "#6d28d9" },
  { initials: "SH", color: "#0f766e" },
  { initials: "BI", color: "#b45309" },
  { initials: "SA", color: "#be185d" },
  { initials: "YA", color: "#0369a1" },
  { initials: "OM", color: "#c2410c" },
  { initials: "RA", color: "#4d7c0f" },
  { initials: "NA", color: "#b91c1c" },
] as const;

/** A photo; without a loaded URL it shows the mock's placeholder, initials on eight colors. */
export function ImageAttachment({
  alt,
  uri,
  aspectRatio,
}: {
  alt: string;
  uri: string | null;
  aspectRatio: number;
}) {
  const [width, setWidth] = useState(0);
  const onLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);
  const dot = Math.max(0, (width / 2 - 20 - 18) / 4);
  if (uri) {
    return (
      <Image
        accessibilityLabel={alt}
        source={{ uri }}
        style={{ width: 320, maxWidth: "100%", aspectRatio, borderRadius: 14 }}
      />
    );
  }
  const halves = [
    { key: "light", background: "#fafafa" },
    { key: "dark", background: "#111214" },
  ];
  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={alt}
      onLayout={onLayout}
      style={{
        width: 320,
        maxWidth: "100%",
        borderRadius: 14,
        overflow: "hidden",
        flexDirection: "row",
      }}
    >
      {halves.map((tile) => (
        <View
          key={tile.key}
          style={{
            flex: 1,
            backgroundColor: tile.background,
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 6,
            paddingVertical: 12,
            paddingHorizontal: 10,
          }}
        >
          {SAMPLE_TILES.map((item) => (
            <View
              key={item.initials}
              style={{
                width: dot,
                height: dot,
                borderRadius: dot / 2,
                backgroundColor: item.color,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <T size={8} weight={700} color="#ffffff" lineHeight={8}>
                {item.initials}
              </T>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}
