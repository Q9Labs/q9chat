import type { api } from "@q9chat/convex";
import { timeLabel } from "@q9chat/domain";
import type { FunctionReturnType } from "convex/server";

import { Composer } from "../kit/Composer";
import { noop } from "../kit/noop";
import { TimelineRow, type GroupActions } from "../kit/Timeline";
import { config } from "../session/config";
import { T } from "../theme/Text";
import { messageSegments } from "./historyRows";
import { livePerson } from "./livePeople";
import { useSenderTyping } from "./useSenderTyping";
import type { useTextOutbox } from "./useTextOutbox";

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
                content: { kind: "text", segments: messageSegments(post.body, []), edited: false },
                quote: null,
                reactions: [],
                summary: `${me.name}: ${post.body}`,
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
}: {
  text: Text;
  group: Group;
  onSent: () => void;
}) {
  const typing = useSenderTyping(group.groupId);
  return (
    <>
      {text.error || typing.error ? (
        <T color="er" style={{ padding: 12 }} accessibilityLiveRegion="polite">
          {text.error || typing.error}
        </T>
      ) : null}
      <Composer
        mode={{ kind: "compose" }}
        draft={text.draft}
        groupTitle={group.title}
        onDraftChange={(draft) => {
          text.change(draft);
          typing.change(draft);
        }}
        onSend={() => {
          if (text.submit()) {
            typing.clear();
            onSent();
          }
        }}
        onAttach={() => text.notice("Photos and files aren't available yet.")}
        onRecord={() => text.notice("Voice notes aren't available yet.")}
        onCancelMode={noop}
        onRecordCancel={noop}
        onRecordSend={noop}
      />
    </>
  );
}
