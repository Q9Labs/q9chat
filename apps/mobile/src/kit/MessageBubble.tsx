import { useRef, type ReactNode } from "react";
import {
  View,
  type AccessibilityActionEvent,
  type AccessibilityActionInfo,
  type ViewInstance,
} from "react-native";

import { useTheme } from "../theme";
import { T } from "../theme/Text";
import { radius } from "../theme/tokens";
import type { Emoji, Message, MessageContent, SendState } from "../types";
import { isWebUrl } from "./format";
import { Icon } from "./Icon";
import { openWebUrl } from "./links";
import { LiveAttachments } from "./LiveAttachments";
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
  onContentLayout?: ((node: ViewInstance) => void) | undefined;
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

/**
 * The message as one screen-reader element with the long-press actions. When the message carries its
 * own controls (play, reactions, the quote, Retry) the wrapper can't be that element, or the controls
 * would be hidden inside it, so the text gets it instead.
 */
type MessageElement = {
  accessible: true;
  accessibilityLabel: string;
  accessibilityActions: AccessibilityActionInfo[];
  onAccessibilityAction: (event: AccessibilityActionEvent) => void;
};

/** The wrapper that makes content the message's element, or the content itself when the outer wrapper already is. */
const withElement = (element: MessageElement | null, node: ReactNode) =>
  element && node ? <View {...element}>{node}</View> : node;

const hasControls = ({ content, quote, reactions, state }: Message) =>
  content.kind === "voice" ||
  content.kind === "attachments" ||
  quote !== null ||
  reactions.length > 0 ||
  state === "failed";

function textOf(content: MessageContent): ReactNode {
  if (content.kind === "text")
    return <BodyText segments={content.segments} edited={content.edited} />;
  if (content.kind === "attachments" && content.caption.length)
    return <BodyText segments={content.caption} />;
  if (content.kind === "image" && content.caption) return <BodyText segments={content.caption} />;
  return null;
}

function ContentBounds({
  mine,
  onMeasure,
  children,
}: {
  mine: boolean;
  onMeasure: ((node: ViewInstance) => void) | undefined;
  children: ReactNode;
}) {
  const node = useRef<ViewInstance>(null);
  if (!onMeasure) return children;
  return (
    <View
      ref={node}
      collapsable={false}
      onLayout={() => {
        if (node.current) onMeasure(node.current);
      }}
      style={{ maxWidth: "100%", gap: 4, alignItems: mine ? "flex-end" : "flex-start" }}
    >
      {children}
    </View>
  );
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
  element,
  onQuotePress,
}: {
  message: Message;
  element: MessageElement | null;
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
      {withElement(element, body)}
    </View>
  );
}

function MediaBody({ content }: { content: MessageContent }) {
  if (content.kind === "image")
    return (
      <ImageAttachment alt={content.alt} uri={content.uri} aspectRatio={content.aspectRatio} />
    );
  if (content.kind === "file") return <FileCard name={content.name} size={content.size} />;
  return null;
}

function Media({
  content,
  element,
  actions,
}: {
  content: MessageContent;
  element: MessageElement | null;
  actions: MessageActions;
}) {
  if (content.kind === "attachments")
    return <LiveAttachments files={content.files} onOpenSheet={actions.onOpenSheet} />;
  if (content.kind === "voice") {
    return (
      <VoiceNote
        durationSeconds={content.durationSeconds}
        waveform={content.waveform}
        playing={actions.playing}
        progress={actions.playProgress}
        onTogglePlay={actions.onTogglePlay}
        {...(element
          ? {
              accessibilityActions: element.accessibilityActions,
              onAccessibilityAction: element.onAccessibilityAction,
            }
          : {})}
      />
    );
  }
  return withElement(element, <MediaBody content={content} />);
}

function Body({
  message,
  element,
  actions,
  readOnly,
}: {
  readOnly: boolean;
  message: Message;
  element: MessageElement | null;
  actions: MessageActions;
}) {
  const { poppedEmoji } = actions;
  return (
    <>
      <ContentBounds mine={message.mine} onMeasure={actions.onContentLayout}>
        <Surface message={message} element={element} onQuotePress={actions.onQuotePress} />
        <Media content={message.content} element={element} actions={actions} />
      </ContentBounds>
      <ReactionPills
        readOnly={readOnly}
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

const canOpen = ({ state, content }: Message) => state === "sent" && content.kind !== "deleted";

function TimeLabel({ message, show }: { message: Message; show: boolean }) {
  if (!show || message.state !== "sent") return null;
  return (
    <T size={12} color="mu" tabular style={{ marginHorizontal: 6 }}>
      {message.timeLabel}
    </T>
  );
}

const LINK_ACTION = "link-";

/** The http and https links in the message text, in reading order. */
function linksOf({ content }: Message): string[] {
  const segments =
    content.kind === "text"
      ? content.segments
      : content.kind === "image" || content.kind === "attachments"
        ? content.caption
        : null;
  return (segments ?? []).flatMap((segment) =>
    segment.type === "link" && isWebUrl(segment.text) ? [segment.text] : [],
  );
}

/** Screen readers get each link as an action of the message, since the message is one element. */
const elementOf = (
  message: Message,
  openable: boolean,
  onOpenSheet: () => void,
): MessageElement => {
  const links = linksOf(message);
  return {
    accessible: true,
    accessibilityLabel: message.summary,
    accessibilityActions: [
      ...(openable ? [{ name: "longpress", label: "Message actions" }] : []),
      ...links.map((url, index) => ({ name: `${LINK_ACTION}${index}`, label: `Open ${url}` })),
    ],
    onAccessibilityAction: (event) => {
      const { actionName } = event.nativeEvent;
      if (actionName === "longpress") onOpenSheet();
      else if (actionName.startsWith(LINK_ACTION)) {
        const url = links[Number(actionName.slice(LINK_ACTION.length))];
        if (url) openWebUrl(url);
      }
    },
  };
};

/**
 * One message: the raised bubble, media, reactions and send state.
 * Tap shows the time, a 480 ms press opens the message sheet; unsent and deleted messages can't.
 */
export function MessageBubble({
  message,
  showTime,
  readOnly = false,
  ...actions
}: { message: Message; showTime: boolean; readOnly?: boolean } & MessageActions) {
  const { content, mine, state } = message;
  const openable = !readOnly && canOpen(message);
  const element = elementOf(message, openable, actions.onOpenSheet);
  const split = hasControls(message);
  return (
    <Press
      {...(split ? { accessible: false } : element)}
      onPress={actions.onToggleTime}
      onLongPress={openable ? actions.onOpenSheet : undefined}
      delayLongPress={LONG_PRESS_MS}
      scaleTo={1}
      style={layoutOf(mine)}
    >
      {content.kind === "deleted" ? (
        <ContentBounds mine={mine} onMeasure={actions.onContentLayout}>
          <DeletedLine mine={mine} />
        </ContentBounds>
      ) : (
        <Body
          message={message}
          element={split ? element : null}
          actions={actions}
          readOnly={readOnly}
        />
      )}
      <SendState state={state} onRetry={actions.onRetry} />
      <TimeLabel message={message} show={showTime} />
    </Press>
  );
}
