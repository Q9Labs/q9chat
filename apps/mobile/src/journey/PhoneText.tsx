import type { api } from "@q9chat/convex";
import { timeLabel } from "@q9chat/domain";
import type { FunctionReturnType } from "convex/server";
import { useState } from "react";

import { Composer } from "../kit/Composer";
import { Sheet, SheetRow } from "../kit/Overlays";
import { TimelineRow, type GroupActions } from "../kit/Timeline";
import { config } from "../session/config";
import { T } from "../theme/Text";
import { pickAttachment } from "./attachments";
import { messageSegments } from "./historyRows";
import { livePerson } from "./livePeople";
import type { useMessageActions } from "./useMessageActions";
import { useSenderTyping } from "./useSenderTyping";
import type { useTextOutbox } from "./useTextOutbox";
import { useVoiceRecording } from "./useVoiceRecording";

type Group = Extract<FunctionReturnType<typeof api.groups.get>, { status: "member" }>;
type Text = ReturnType<typeof useTextOutbox>;

export function PendingPosts({ text, actions }: { text: Text; actions: GroupActions }) {
  const { me } = text;
  return (
    <>
      {text.pending.map((post) => (
        <TimelineRow
          key={post.clientKey}
          first={false}
          item={{
            type: "group",
            id: post.clientKey,
            author: livePerson(me, config.siteUrl),
            timeLabel: timeLabel(post.createdAt, post.createdAt),
            messages: [
              {
                id: post.clientKey,
                timeLabel: timeLabel(post.createdAt, post.createdAt),
                mine: true,
                state: post.status,
                content: post.attachment
                  ? {
                      kind: "attachments",
                      caption: [],
                      files: [
                        post.attachment.kind === "voice"
                          ? {
                              ...post.attachment,
                              waveform: [...post.attachment.waveform],
                              url: post.attachment.uri,
                            }
                          : { ...post.attachment, url: post.attachment.uri },
                      ],
                    }
                  : { kind: "text", segments: messageSegments(post.body, []), edited: false },
                quote: post.reply ?? null,
                reactions: [],
                summary: `${me.name}: ${post.attachment ? (post.attachment.kind === "file" ? post.attachment.name : post.attachment.kind === "image" ? "Photo" : "Voice note") : post.body}`,
                copyText: null,
              },
            ],
          }}
          actions={{ ...actions, onRetry: text.retry }}
        />
      ))}
    </>
  );
}

export function TextComposer({
  text,
  group,
  onSent,
  actions,
}: {
  text: Text;
  group: Group;
  onSent: () => void;
  actions: ReturnType<typeof useMessageActions>;
}) {
  const typing = useSenderTyping(group.groupId);
  const [attaching, setAttaching] = useState(false);
  const voice = useVoiceRecording((file) => {
    if (text.attach(file, actions.attachmentReply)) {
      actions.sentAttachment();
      onSent();
    }
  }, text.notice);
  async function pick(kind: "image" | "file") {
    setAttaching(false);
    try {
      const file = await pickAttachment(kind);
      if (file && text.attach(file, actions.attachmentReply)) {
        actions.sentAttachment();
        onSent();
      }
    } catch (error) {
      text.notice(error instanceof Error ? error.message : "Couldn't open the picker. Try again.");
    }
  }
  const error = text.error || typing.error || (!actions.sheet ? actions.error : "");
  return (
    <>
      {error ? (
        <T color="er" style={{ padding: 12 }} accessibilityLiveRegion="polite">
          {error}
        </T>
      ) : null}
      <Composer
        mode={voice.mode ?? actions.mode}
        draft={actions.draft}
        groupTitle={group.title}
        onDraftChange={(draft) => {
          actions.change(draft);
          typing.change(draft);
        }}
        onBlur={typing.clear}
        onSend={() =>
          actions.submit(() => {
            typing.clear();
            onSent();
          })
        }
        onAttach={() => {
          if (actions.mode.kind !== "edit") setAttaching(true);
        }}
        onRecord={() => {
          if (actions.mode.kind !== "edit") void voice.start();
        }}
        onCancelMode={() => actions.cancel()}
        onRecordCancel={() => void voice.finish(false)}
        onRecordSend={() => void voice.finish(true)}
      />
      {attaching ? (
        <Sheet label="Attach" onDismiss={() => setAttaching(false)}>
          <SheetRow icon="image" label="Photo" onPress={() => void pick("image")} />
          <SheetRow icon="file" label="File" onPress={() => void pick("file")} />
        </Sheet>
      ) : null}
    </>
  );
}
