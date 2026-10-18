import { View } from "react-native";
import { useTheme } from "../theme";
import { T } from "../theme/Text";
import { radius } from "../theme/tokens";
import { Icon } from "./Icon";
import { noop } from "./noop";
import { BodyText, FileCard, ImageAttachment, QuoteBar, ReactionPills, VoiceNote } from "./MessageParts";
import { Press } from "./Press";
import type { Emoji, Message } from "../types";

export const LONG_PRESS_MS = 480;

type Actions = {
  onToggleTime?: () => void;
  onOpenSheet?: () => void;
  onRetry?: () => void;
  onQuotePress?: (messageId: string) => void;
  onReactionPress?: (emoji: Emoji) => void;
  onReactionLongPress?: (emoji: Emoji) => void;
  onTogglePlay?: () => void;
  playing?: boolean;
  playProgress?: number;
  poppedEmoji?: Emoji;
};

/**
 * One message: the raised bubble (18px radius, 8 by 12 padding), media, reactions and send state.
 * Tap shows the time, a 480 ms press opens the message sheet; unsent and deleted messages can't.
 */
export function MessageBubble({
  message,
  showTime,
  ...actions
}: { message: Message; showTime?: boolean } & Actions) {
  const { c } = useTheme();
  const { content, mine, state } = message;
  const openable = state === "sent" && content.kind !== "deleted";
  const dimmed = state === "sending" || state === "queued";
  const flash = message.highlighted ? c.s3 : c.s1;

  const text =
    content.kind === "text" ? <BodyText segments={content.segments} edited={content.edited} /> : content.kind === "image" && content.caption ? <BodyText segments={content.caption} /> : null;
  const quote = message.quote ? <QuoteBar quote={message.quote} onPress={() => actions.onQuotePress?.(message.quote?.messageId ?? "")} /> : null;

  return (
    <Press
      accessibilityLabel={message.summary}
      onPress={actions.onToggleTime}
      onLongPress={openable ? actions.onOpenSheet : undefined}
      delayLongPress={LONG_PRESS_MS}
      scaleTo={1}
      style={{ maxWidth: mine ? "80%" : "100%", marginEnd: mine ? 0 : 24, gap: 4, alignItems: mine ? "flex-end" : "flex-start" }}
    >
      {content.kind === "deleted" ? (
        <View style={{ paddingHorizontal: 4, paddingVertical: 8, flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Icon name="ban" size={14} color="mu" />
          <T color="mu" style={{ fontStyle: "italic" }}>
            {mine ? "You deleted this message" : "Message deleted"}
          </T>
        </View>
      ) : (
        <>
          {quote || text ? (
            <View
              style={{
                backgroundColor: flash,
                borderRadius: radius.bubble,
                paddingVertical: 8,
                paddingHorizontal: 12,
                maxWidth: "100%",
                alignItems: "flex-start",
                opacity: dimmed ? 0.55 : 1,
              }}
            >
              {quote}
              {text}
            </View>
          ) : null}
          {content.kind === "image" ? <ImageAttachment alt={content.alt} uri={content.uri} aspectRatio={content.aspectRatio} /> : null}
          {content.kind === "file" ? <FileCard name={content.name} size={content.size} /> : null}
          {content.kind === "voice" ? (
            <VoiceNote
              durationSeconds={content.durationSeconds}
              waveform={content.waveform}
              playing={actions.playing ?? false}
              progress={actions.playProgress ?? 0}
              onTogglePlay={actions.onTogglePlay ?? noop}
            />
          ) : null}
          <ReactionPills
            reactions={message.reactions}
            onPress={(emoji) => actions.onReactionPress?.(emoji)}
            onLongPress={(emoji) => actions.onReactionLongPress?.(emoji)}
            {...(actions.poppedEmoji ? { poppedEmoji: actions.poppedEmoji } : {})}
          />
        </>
      )}
      {state === "sending" || state === "queued" ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginHorizontal: 4 }}>
          <Icon name="clock" size={13} color="mu" />
          <T size={12} color="mu" tabular>
            {state === "sending" ? "Sending" : "Waiting for connection"}
          </T>
        </View>
      ) : null}
      {state === "failed" ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginHorizontal: 4 }}>
          <Icon name="alert" size={13} color="er" />
          <T size={12} weight={500} color="er" tabular>
            {"Not sent ·"}
          </T>
          <Press accessibilityRole="button" accessibilityLabel="Retry" onPress={actions.onRetry} scaleTo={1}>
            <T size={12} weight={600} color="er" style={{ textDecorationLine: "underline" }}>
              Retry
            </T>
          </Press>
        </View>
      ) : null}
      {showTime && state === "sent" ? (
        <T size={12} color="mu" tabular style={{ marginHorizontal: 6 }}>
          {message.timeLabel}
        </T>
      ) : null}
    </Press>
  );
}
