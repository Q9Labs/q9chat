import { api } from "@q9chat/convex";
import { messageSummary } from "@q9chat/domain";
import { useQuery } from "convex/react";
import { useState } from "react";
import { View } from "react-native";

import { RadioList } from "../kit/Controls";
import { ConfirmSheet, Sheet, SheetTitle, Toast } from "../kit/Overlays";
import { MessageSheet } from "../screens/ChatScreen";
import { config } from "../session/config";
import { T } from "../theme/Text";
import type { HistoryGroup } from "./historyRows";
import { historyItem } from "./historyRows";
import type { ActionSheet, useMessageActions } from "./useMessageActions";

type Actions = ReturnType<typeof useMessageActions>;
type Post = ActionSheet["post"];
function Reactors({ post, close }: { post: Post; close: () => void }) {
  const groups = useQuery(api.messages.reactors, { messageId: post.id });
  return (
    <Sheet label="Reactions" onDismiss={close}>
      <SheetTitle>Reactions</SheetTitle>
      {groups === undefined ? (
        <T color="mu">Loading reactions…</T>
      ) : groups.length === 0 ? (
        <T color="mu">No reactions yet</T>
      ) : (
        groups.map((reaction) => {
          const names = reaction.people.map((person) => (person.isYou ? "You" : person.name));
          const remaining = reaction.count - names.length;
          return (
            <View
              key={reaction.emoji}
              style={{ flexDirection: "row", gap: 14, minHeight: 52, alignItems: "center" }}
            >
              <T size={20}>{reaction.emoji}</T>
              <T size={16} style={{ flexShrink: 1 }}>
                {names.join(", ")}
                {remaining > 0 ? ` and ${remaining} others` : ""}
              </T>
            </View>
          );
        })
      )}
    </Sheet>
  );
}
function Report({ post, actions }: { post: Post; actions: Actions }) {
  const [reason, setReason] = useState<"spam" | "harassment" | "other" | null>(null);
  return (
    <ConfirmSheet
      title="Report this message"
      text={`${post.author.name} isn't told who reported it.`}
      danger={false}
      confirmLabel={actions.pending ? "Sending…" : "Send report"}
      confirmDisabled={!reason || actions.pending}
      onConfirm={() => {
        if (reason) actions.report(post, reason);
      }}
      onCancel={actions.close}
    >
      <RadioList
        label="Reason"
        value={reason}
        onChange={setReason}
        options={[
          { value: "spam", label: "Spam" },
          { value: "harassment", label: "Harassment or hate" },
          { value: "other", label: "Something else" },
        ]}
      />
      {actions.error ? (
        <T color="er" accessibilityLiveRegion="polite">
          {actions.error}
        </T>
      ) : null}
    </ConfirmSheet>
  );
}
function DeleteMessage({ post, actions }: { post: Post; actions: Actions }) {
  return (
    <ConfirmSheet
      title="Delete this message?"
      text="It's removed for everyone. A quiet placeholder stays, so replies to it still make sense."
      confirmLabel={actions.pending ? "Deleting…" : "Delete"}
      confirmDisabled={actions.pending}
      onConfirm={() => actions.remove(post)}
      onCancel={actions.close}
    >
      {actions.error ? (
        <T color="er" accessibilityLiveRegion="polite">
          {actions.error}
        </T>
      ) : null}
    </ConfirmSheet>
  );
}
export function PhoneMessageSheets({ actions, group }: { actions: Actions; group: HistoryGroup }) {
  const sheet = actions.sheet;
  if (!sheet) return actions.toast ? <Toast text={actions.toast} /> : null;
  const { post } = sheet;
  if (sheet.kind === "delete") return <DeleteMessage post={post} actions={actions} />;
  if (sheet.kind === "report") return <Report key={post.id} post={post} actions={actions} />;
  if (sheet.kind === "reactions") return <Reactors post={post} close={actions.close} />;
  return <PostMessageSheet post={post} actions={actions} group={group} />;
}
function PostMessageSheet({
  post,
  actions,
  group,
}: {
  post: Post;
  actions: Actions;
  group: HistoryGroup;
}) {
  const item = historyItem(post, config.siteUrl, {
    members: group.members,
    previous: undefined,
    unread: null,
  });
  const message = item.type === "group" ? item.messages[0] : undefined;
  if (!message) return null;
  return (
    <MessageSheet
      message={{ ...message, summary: messageSummary(post) }}
      author={post.author.name}
      notice={actions.error}
      props={{
        onCloseSheet: actions.close,
        onReply: () => actions.reply(post),
        onEdit: () => actions.edit(post),
        onCopy: () => actions.copy(post),
        onAskDelete: () => actions.open(post.id, "delete"),
        onAskReport: () => actions.open(post.id, "report"),
        onReact: (id, emoji) => actions.react(id, emoji),
      }}
    />
  );
}
