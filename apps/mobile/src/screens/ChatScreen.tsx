import { KeyboardAvoidingView, Platform, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Avatar } from "../kit/Avatar";
import { IconButton, PillButton } from "../kit/Buttons";
import { CenterState, OfflinePill } from "../kit/Chrome";
import { Composer, type ComposerMode } from "../kit/Composer";
import { RadioList } from "../kit/Controls";
import { Icon } from "../kit/Icon";
import { ConfirmSheet, Sheet, SheetRow, SheetTitle, Toast } from "../kit/Overlays";
import { Press } from "../kit/Press";
import { Timeline } from "../kit/Timeline";
import { useTheme } from "../theme";
import { T } from "../theme/Text";
import {
  EMOJI,
  type Avatar as AvatarData,
  type Emoji,
  type Message,
  type Person,
  type TimelineItem,
} from "../types";

export type ChatSheet =
  | { type: "message"; messageId: string }
  | { type: "reactions"; messageId: string }
  | { type: "attach" }
  | { type: "delete"; messageId: string }
  | { type: "report"; messageId: string; reason: ReportReason | null };

export type ReportReason = "Spam" | "Harassment or hate" | "Something else";
const REPORT_REASONS: readonly ReportReason[] = ["Spam", "Harassment or hate", "Something else"];

export type ChatScreenProps = {
  title: string;
  avatar: AvatarData;
  /** "5 members" for groups; null for a pair. */
  subtitle: string | null;
  muted: boolean;
  /** Set when you were removed: history and composer are replaced by the removal notice. */
  removed: { by: string; when: string } | null;
  offline: boolean;
  items: readonly TimelineItem[];
  typingText: string | null;
  latestKey: string;
  tappedMessageId: string | null;
  playingMessageId: string | null;
  playProgress: number;
  poppedReaction: { messageId: string; emoji: Emoji } | null;
  composer: ComposerMode;
  draft: string;
  sheet: ChatSheet | null;
  toast: string | null;
  onBack: () => void;
  onOpenInfo: () => void;
  onSearch: () => void;
  onDraftChange: (text: string) => void;
  onSend: () => void;
  onAttach: () => void;
  onAttachPick: (kind: "photo" | "file") => void;
  onRecord: () => void;
  onRecordCancel: () => void;
  onRecordSend: () => void;
  onCancelComposerMode: () => void;
  onToggleTime: (messageId: string) => void;
  onOpenMessageSheet: (messageId: string) => void;
  onOpenReactions: (messageId: string) => void;
  onReact: (messageId: string, emoji: Emoji) => void;
  onRetry: (messageId: string) => void;
  onQuotePress: (messageId: string) => void;
  onTogglePlay: (messageId: string) => void;
  onAuthorPress: (author: Person) => void;
  onReply: (messageId: string) => void;
  onEdit: (messageId: string) => void;
  onCopy: (messageId: string) => void;
  onAskDelete: (messageId: string) => void;
  onConfirmDelete: (messageId: string) => void;
  onAskReport: (messageId: string) => void;
  onPickReportReason: (reason: ReportReason) => void;
  onSendReport: (messageId: string, reason: ReportReason) => void;
  onCloseSheet: () => void;
  onForget: () => void;
};

function findMessage(items: readonly TimelineItem[], id: string): Message | null {
  for (const item of items) {
    if (item.type !== "group") continue;
    const found = item.messages.find((message) => message.id === id);
    if (found) return found;
  }
  return null;
}

type HeaderProps = Pick<
  ChatScreenProps,
  "title" | "avatar" | "subtitle" | "muted" | "removed" | "onBack" | "onOpenInfo" | "onSearch"
> & { hideSearch?: boolean };

/** The chat header: back, who it is with, and Search. */
export function ChatHeader(props: HeaderProps) {
  const removed = props.removed !== null;
  return (
    <View
      style={{
        minHeight: 56,
        flexDirection: "row",
        alignItems: "center",
        paddingStart: 4,
        paddingEnd: 6,
        gap: 2,
      }}
    >
      <IconButton
        icon="back"
        iconSize={26}
        label="Back to groups"
        color="tx"
        onPress={props.onBack}
      />
      <Press
        accessibilityRole="button"
        accessibilityLabel={`Group info for ${props.title}${props.muted ? ", muted" : ""}`}
        onPress={props.onOpenInfo}
        scaleTo={1}
        style={{
          flexShrink: 1,
          minHeight: 44,
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          paddingVertical: 2,
          paddingStart: 2,
          paddingEnd: 8,
          borderRadius: 999,
        }}
      >
        <Avatar avatar={props.avatar} size={32} />
        <ChatTitle {...props} />
      </Press>
      <View style={{ flex: 1 }} />
      {removed || props.hideSearch ? null : (
        <IconButton
          icon="search"
          iconSize={22}
          label="Search in this group"
          color="tx"
          onPress={props.onSearch}
        />
      )}
    </View>
  );
}

function ChatTitle(props: HeaderProps) {
  const removed = props.removed !== null;
  return (
    <View style={{ flexShrink: 1 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <T size={16} weight={600} numberOfLines={1} style={{ flexShrink: 1 }}>
          {props.title}
        </T>
        {props.muted && !removed ? <Icon name="bellOff" size={14} color="mu" /> : null}
      </View>
      {props.subtitle && !removed ? (
        <T size={12} color="mu">
          {props.subtitle}
        </T>
      ) : null}
    </View>
  );
}

type MessageSheetActions = Pick<
  ChatScreenProps,
  "onReply" | "onEdit" | "onCopy" | "onAskDelete" | "onAskReport" | "onReact" | "onCloseSheet"
>;
function MessageRows({ message, props }: { message: Message; props: MessageSheetActions }) {
  const { content, mine } = message;
  return (
    <View>
      <SheetRow first icon="reply" label="Reply" onPress={() => props.onReply(message.id)} />
      {mine && content.kind === "text" ? (
        <SheetRow icon="pencil" label="Edit" onPress={() => props.onEdit(message.id)} />
      ) : null}
      {message.copyText !== null ? (
        <SheetRow icon="copy" label="Copy text" onPress={() => props.onCopy(message.id)} />
      ) : null}
      {mine ? (
        <SheetRow
          danger
          icon="trash"
          label="Delete"
          onPress={() => props.onAskDelete(message.id)}
        />
      ) : (
        <SheetRow danger icon="flag" label="Report" onPress={() => props.onAskReport(message.id)} />
      )}
    </View>
  );
}

export function MessageSheet({
  message,
  author,
  props,
  notice,
}: {
  message: Message;
  author: string;
  props: MessageSheetActions;
  notice?: string;
}) {
  return (
    <Sheet label="Message actions" onDismiss={props.onCloseSheet}>
      <PreviewLine author={message.mine ? "You" : author} summary={message.summary} />
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          paddingTop: 2,
          paddingBottom: 12,
        }}
        accessibilityLabel="React"
      >
        {EMOJI.map((emoji) => (
          <EmojiButton
            key={emoji}
            emoji={emoji}
            on={message.reactions.some((reaction) => reaction.emoji === emoji && reaction.mine)}
            onPress={() => props.onReact(message.id, emoji)}
          />
        ))}
      </View>
      <MessageRows message={message} props={props} />
      {notice ? (
        <T color="er" accessibilityLiveRegion="polite">
          {notice}
        </T>
      ) : null}
    </Sheet>
  );
}

function PreviewLine({ author, summary }: { author: string; summary: string }) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        paddingHorizontal: 4,
        paddingBottom: 14,
      }}
    >
      <T size={14} color="mu" numberOfLines={1} style={{ flex: 1 }}>
        <T size={14} weight={600}>
          {author}
        </T>
        {` · ${summary}`}
      </T>
    </View>
  );
}

function EmojiButton({ emoji, on, onPress }: { emoji: Emoji; on: boolean; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Press
      accessibilityRole="button"
      accessibilityLabel={`React with ${emoji}`}
      accessibilityState={{ selected: on }}
      onPress={onPress}
      scaleTo={0.9}
      style={{
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: on ? c.acw : c.s1,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <T size={26} lineHeight={32}>
        {emoji}
      </T>
    </Press>
  );
}

function ReactionsSheet({ message, onDismiss }: { message: Message; onDismiss: () => void }) {
  const { c } = useTheme();
  return (
    <Sheet label="Reactions" onDismiss={onDismiss}>
      <SheetTitle>Reactions</SheetTitle>
      {message.reactions.map((reaction, index) => (
        <View
          key={reaction.emoji}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 14,
            minHeight: 52,
            paddingHorizontal: 20,
            marginHorizontal: -16,
            borderTopWidth: index === 0 ? 0 : 1,
            borderTopColor: c.ln,
          }}
        >
          <T size={20} lineHeight={28}>
            {reaction.emoji}
          </T>
          <T size={16}>{reaction.who}</T>
        </View>
      ))}
    </Sheet>
  );
}

function ChatSheets({ sheet, props }: { sheet: ChatSheet; props: ChatScreenProps }) {
  if (sheet.type === "attach") {
    return (
      <Sheet label="Attach" onDismiss={props.onCloseSheet}>
        <SheetRow first icon="image" label="Photo" onPress={() => props.onAttachPick("photo")} />
        <SheetRow icon="file" label="File" onPress={() => props.onAttachPick("file")} />
      </Sheet>
    );
  }
  if (sheet.type === "delete") {
    return (
      <ConfirmSheet
        title="Delete this message?"
        text="It's removed for everyone. A quiet placeholder stays, so replies to it still make sense."
        confirmLabel="Delete"
        onConfirm={() => props.onConfirmDelete(sheet.messageId)}
        onCancel={props.onCloseSheet}
      />
    );
  }
  const message = findMessage(props.items, sheet.messageId);
  if (!message) return null;
  const author = sheetAuthor(props.items, message.id);
  if (sheet.type === "message")
    return <MessageSheet message={message} author={author} props={props} />;
  if (sheet.type === "reactions")
    return <ReactionsSheet message={message} onDismiss={props.onCloseSheet} />;
  return <ReportSheet props={props} reason={sheet.reason} messageId={message.id} author={author} />;
}

function RemovedBody({
  removed,
  props,
}: {
  removed: { by: string; when: string };
  props: ChatScreenProps;
}) {
  return (
    <>
      <CenterState
        icon="ban"
        title="You were removed from this group"
        text={`${removed.by} removed you ${removed.when}. Only members can read a group, so its messages are hidden.`}
        action={<PillButton label="Remove from my list" onPress={props.onForget} />}
      />
      <Composer {...composerProps(props, { kind: "readonly" })} />
    </>
  );
}

function LiveBody({ props }: { props: ChatScreenProps }) {
  return (
    <>
      {props.offline ? <OfflinePill /> : null}
      <Timeline
        items={props.items}
        typingText={props.typingText}
        latestKey={props.latestKey}
        tappedId={props.tappedMessageId}
        playingId={props.playingMessageId}
        playProgress={props.playProgress}
        poppedReaction={props.poppedReaction}
        onToggleTime={props.onToggleTime}
        onOpenSheet={props.onOpenMessageSheet}
        onRetry={props.onRetry}
        onQuotePress={props.onQuotePress}
        onReactionPress={props.onReact}
        onReactionLongPress={props.onOpenReactions}
        onTogglePlay={props.onTogglePlay}
        onAuthorPress={props.onAuthorPress}
      />
      <Composer {...composerProps(props, props.composer)} />
    </>
  );
}

export function ChatScreen(props: ChatScreenProps) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: c.s0, paddingTop: insets.top }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ChatHeader {...props} />
        {props.removed ? (
          <RemovedBody removed={props.removed} props={props} />
        ) : (
          <LiveBody props={props} />
        )}
      </KeyboardAvoidingView>
      {props.sheet ? <ChatSheets sheet={props.sheet} props={props} /> : null}
      {props.toast ? <Toast text={props.toast} /> : null}
    </View>
  );
}

function sheetAuthor(items: readonly TimelineItem[], messageId: string): string {
  for (const item of items) {
    if (item.type === "group" && item.messages.some((message) => message.id === messageId))
      return item.author.name;
  }
  return "They";
}

function ReportSheet({
  props,
  reason,
  messageId,
  author,
}: {
  props: ChatScreenProps;
  reason: ReportReason | null;
  messageId: string;
  author: string;
}) {
  return (
    <ConfirmSheet
      title="Report this message"
      text={`We review reports within a day. ${author} isn't told who reported it.`}
      confirmLabel="Send report"
      danger={false}
      confirmDisabled={reason === null}
      onConfirm={() => (reason ? props.onSendReport(messageId, reason) : undefined)}
      onCancel={props.onCloseSheet}
    >
      <RadioList
        label="Reason"
        value={reason}
        onChange={props.onPickReportReason}
        options={REPORT_REASONS.map((value) => ({ value, label: value }))}
      />
    </ConfirmSheet>
  );
}

function composerProps(props: ChatScreenProps, mode: ComposerMode) {
  return {
    mode,
    draft: props.draft,
    onDraftChange: props.onDraftChange,
    groupTitle: props.title,
    onSend: props.onSend,
    onAttach: props.onAttach,
    onRecord: props.onRecord,
    onCancelMode: props.onCancelComposerMode,
    onRecordCancel: props.onRecordCancel,
    onRecordSend: props.onRecordSend,
  };
}
