import type { ReactNode } from "react";
import { View } from "react-native";

import { useTheme } from "../theme";
import { T } from "../theme/Text";
import { radius } from "../theme/tokens";
import type { Emoji, Message, MessageContent, SendState } from "../types";
import { Icon } from "./Icon";
import {
  BodyText,
  FileCard,
  ImageAttachment,
  QuoteBar,
  ReactionPills,
  VoiceNote,
} from "./MessageParts";
import { Press } from "./Press";

const LONG_PRESS_MS = 480;

export type MessageActions = {
  onToggleTime: () => void;
  onOpenSheet: () => void;
  onRetry: () => void;
  onQuotePress: (messageId: string) => void;
  onReactionPress: (emoji: Emoji) => void;
  onReactionLongPress: (emoji: Emoji) => void;
  onTogglePlay: () => void;
  playing: boolean;
  playProgress: number;
  poppedEmoji: Emoji | null;
};

const isPending = (state: SendState) => state === "sending" || state === "queued";

function textOf(content: MessageContent): ReactNode {
  if (content.kind === "text")
    return <BodyText segments={content.segments} edited={content.edited} />;
  if (content.kind === "image" && content.caption) return <BodyText segments={content.caption} />;
  return null;
}

function DeletedLine({ mine }: { mine: boolean }) {
  return (
    <View
      style={{
        paddingHorizontal: 4,
        paddingVertical: 8,
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
      }}
    >
      <Icon name="ban" size={14} color="mu" />
      <T color="mu" italic>
        {mine ? "You deleted this message" : "Message deleted"}
      </T>
    </View>
  );
}

/** The raised surface with the quote and the text: 18px radius, 8 by 12 padding. */
function Surface({
  message,
  onQuotePress,
}: {
  message: Message;
  onQuotePress: (messageId: string) => void;
}) {
  const { c } = useTheme();
  const body = textOf(message.content);
  const { quote } = message;
  if (!quote && !body) return null;
  return (
    <View
      style={{
        backgroundColor: message.highlighted ? c.s3 : c.s1,
        borderRadius: radius.bubble,
        paddingVertical: 8,
        paddingHorizontal: 12,
        maxWidth: "100%",
        alignItems: "flex-start",
        opacity: isPending(message.state) ? 0.55 : 1,
      }}
    >
      {quote ? <QuoteBar quote={quote} onPress={() => onQuotePress(quote.messageId)} /> : null}
      {body}
    </View>
  );
}

function Media({ content, actions }: { content: MessageContent; actions: MessageActions }) {
  if (content.kind === "image")
    return (
      <ImageAttachment alt={content.alt} uri={content.uri} aspectRatio={content.aspectRatio} />
    );
  if (content.kind === "file") return <FileCard name={content.name} size={content.size} />;
  if (content.kind === "voice") {
    return (
      <VoiceNote
        durationSeconds={content.durationSeconds}
        waveform={content.waveform}
        playing={actions.playing}
        progress={actions.playProgress}
        onTogglePlay={actions.onTogglePlay}
      />
    );
  }
  return null;
}

function Body({ message, actions }: { message: Message; actions: MessageActions }) {
  const { poppedEmoji } = actions;
  return (
    <>
      <Surface message={message} onQuotePress={actions.onQuotePress} />
      <Media content={message.content} actions={actions} />
      <ReactionPills
        reactions={message.reactions}
        onPress={actions.onReactionPress}
        onLongPress={actions.onReactionLongPress}
        {...(poppedEmoji ? { poppedEmoji } : {})}
      />
    </>
  );
}

const statusRow = {
  flexDirection: "row",
  alignItems: "center",
  gap: 5,
  marginHorizontal: 4,
} as const;

/** "Sending", "Waiting for connection" or "Not sent · Retry"; nothing once sent. */
function SendState({ state, onRetry }: { state: SendState; onRetry: () => void }) {
  if (isPending(state)) {
    return (
      <View style={statusRow}>
        <Icon name="clock" size={13} color="mu" />
        <T size={12} color="mu" tabular>
          {state === "sending" ? "Sending" : "Waiting for connection"}
        </T>
      </View>
    );
  }
  if (state !== "failed") return null;
  return (
    <View style={statusRow}>
      <Icon name="alert" size={13} color="er" />
      <T size={12} weight={500} color="er" tabular>
        {"Not sent ·"}
      </T>
      <Press accessibilityRole="button" accessibilityLabel="Retry" onPress={onRetry} scaleTo={1}>
        <T size={12} weight={600} color="er" style={{ textDecorationLine: "underline" }}>
          Retry
        </T>
      </Press>
    </View>
  );
}

const layoutOf = (mine: boolean) =>
  ({
    maxWidth: mine ? "80%" : "100%",
    marginEnd: mine ? 0 : 24,
    gap: 4,
    alignItems: mine ? "flex-end" : "flex-start",
  }) as const;

/**
 * One message: the raised bubble, media, reactions and send state.
 * Tap shows the time, a 480 ms press opens the message sheet; unsent and deleted messages can't.
 */
export function MessageBubble({
  message,
  showTime,
  ...actions
}: { message: Message; showTime: boolean } & MessageActions) {
  const { content, mine, state } = message;
  const openable = state === "sent" && content.kind !== "deleted";
  return (
    <Press
      accessibilityLabel={message.summary}
      onPress={actions.onToggleTime}
      onLongPress={openable ? actions.onOpenSheet : undefined}
      delayLongPress={LONG_PRESS_MS}
      scaleTo={1}
      style={layoutOf(mine)}
    >
      {content.kind === "deleted" ? (
        <DeletedLine mine={mine} />
      ) : (
        <Body message={message} actions={actions} />
      )}
      <SendState state={state} onRetry={actions.onRetry} />
      {showTime && state === "sent" ? (
        <T size={12} color="mu" tabular style={{ marginHorizontal: 6 }}>
          {message.timeLabel}
        </T>
      ) : null}
    </Press>
  );
}
