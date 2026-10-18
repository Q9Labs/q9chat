import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { defaultWorld, groupAvatar, groupById, groupTitle, timelineOf, typersOf, waveSamples } from "../../../src/fixtures/build";
import { useToast } from "../../../src/kit/useToast";
import type { ComposerMode } from "../../../src/kit/Composer";
import { ChatScreen, type ChatSheet, type ReportReason } from "../../../src/screens/ChatScreen";
import { noop } from "../../../src/kit/noop";

// Fixture data stands in until the wiring lane maps `groups.get` and `messages.range` onto the same props.
const world = defaultWorld();

export default function ChatRoute() {
  const router = useRouter();
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const group = groupById(groupId);
  const [draft, setDraft] = useState("");
  const [sheet, setSheet] = useState<ChatSheet | null>(null);
  const [composer, setComposer] = useState<ComposerMode>({ kind: "compose" });
  const [tapped, setTapped] = useState<string | null>(null);
  const [toast, showToast] = useToast();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const close = () => {
    setSheet(null);
    setReason(null);
  };
  const openInfo = () => router.push({ pathname: "/g/[groupId]/info", params: { groupId } });

  return (
    <ChatScreen
      title={groupTitle(group, world)}
      avatar={groupAvatar(group)}
      subtitle={group.pair ? null : `${group.members.length} members`}
      muted={world.muted.has(groupId)}
      removed={null}
      offline={false}
      items={timelineOf(groupId, world, group.unread)}
      typingText={typersOf(group, 1, world)}
      latestKey={groupId}
      tappedMessageId={tapped}
      playingMessageId={null}
      playProgress={0}
      poppedReaction={null}
      composer={composer}
      draft={draft}
      sheet={sheet?.type === "report" ? { ...sheet, reason } : sheet}
      toast={toast}
      onBack={() => router.back()}
      onOpenInfo={openInfo}
      onSearch={() => router.push("/search")}
      onDraftChange={setDraft}
      onSend={() => {
        setDraft("");
        setComposer({ kind: "compose" });
      }}
      onAttach={() => setSheet({ type: "attach" })}
      onAttachPick={close}
      onRecord={() => setComposer({ kind: "recording", seconds: 0, levels: waveSamples(11, 30) })}
      onRecordCancel={() => setComposer({ kind: "compose" })}
      onRecordSend={() => setComposer({ kind: "compose" })}
      onCancelComposerMode={() => {
        setDraft("");
        setComposer({ kind: "compose" });
      }}
      onToggleTime={(id) => setTapped((current) => (current === id ? null : id))}
      onOpenMessageSheet={(messageId) => setSheet({ type: "message", messageId })}
      onOpenReactions={(messageId) => setSheet({ type: "reactions", messageId })}
      onReact={close}
      onRetry={noop}
      onQuotePress={noop}
      onTogglePlay={noop}
      onAuthorPress={noop}
      onReply={() => {
        close();
        setComposer({ kind: "reply", author: "Bilal", summary: "Build 1 is up on TestFlight." });
      }}
      onEdit={() => {
        close();
        setComposer({ kind: "edit" });
      }}
      onCopy={() => {
        close();
        showToast("Copied");
      }}
      onAskDelete={(messageId) => setSheet({ type: "delete", messageId })}
      onConfirmDelete={close}
      onAskReport={(messageId) => setSheet({ type: "report", messageId, reason: null })}
      onPickReportReason={setReason}
      onSendReport={() => {
        close();
        showToast("Thanks. We'll review this message.");
      }}
      onCloseSheet={close}
      onForget={() => router.replace("/")}
    />
  );
}
