import { api, type Id } from "@q9chat/convex";
import { useNavigate } from "@tanstack/react-router";
import { useConvexConnectionState, useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useRef, useState } from "react";

import { ChatHeader, RemovedGroupNotice } from "../chat/chat-view.js";
import { ReadOnlyComposer } from "../chat/composer.js";
import type { GroupDetail, Member, NotifyMode, RemovedGroup } from "../chat/types.js";
import { LeaveGroupDialog, RemoveMemberDialog } from "../screens/dialogs.js";
import { GroupInfo } from "../screens/group-info.js";
import { useRoot } from "../ui/root.js";
import { journeyError } from "./group-errors.js";

type Detail = FunctionReturnType<typeof api.groups.get>;
type ActiveGroup = Extract<Detail, { status: "member" }>;
type Confirmation = { kind: "leave" } | { kind: "remove"; member: ActiveGroup["members"][number] };

function useGroupAction() {
  const connection = useConvexConnectionState();
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function run(action: () => Promise<unknown>) {
    if (busy.current) return;
    if (!navigator.onLine || !connection.isWebSocketConnected) {
      setError("You're offline. Reconnect and try again.");
      return;
    }
    busy.current = true;
    setPending(true);
    setError("");
    try {
      await action();
    } catch (cause) {
      setError(journeyError(cause));
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  return { pending, error, clearError: () => setError(""), run };
}

type GroupAction = ReturnType<typeof useGroupAction>;
interface LiveGroupInfoProps {
  readonly group: GroupDetail | RemovedGroup | null;
  readonly detail: Detail | undefined;
  readonly onClose: () => void;
  readonly onAdd: (group: ActiveGroup) => void;
  readonly onCopy: () => void;
  readonly copied: boolean;
  readonly onMessage: (id: Id<"profiles">) => void;
  readonly unavailable: () => void;
  readonly onNotice: (text: string) => void;
}
type ActiveInfoProps = LiveGroupInfoProps & {
  readonly group: GroupDetail;
  readonly detail: ActiveGroup;
};

export function LiveGroupInfo(props: LiveGroupInfoProps) {
  if (props.group?.status === "removed")
    return <RemovedGroupInfo group={props.group} onClose={props.onClose} />;
  if (!props.group || props.detail?.status !== "member") return null;
  return <ActiveGroupInfo {...props} group={props.group} detail={props.detail} />;
}

function noRemovedAction() {}

function RemovedGroupInfo({
  group,
  onClose,
}: {
  readonly group: RemovedGroup;
  readonly onClose: () => void;
}) {
  return (
    <GroupInfo
      group={group}
      onClose={onClose}
      linkCopied={false}
      onAddPeople={noRemovedAction}
      onCopyLink={noRemovedAction}
      onSearch={noRemovedAction}
      notificationsOpen={false}
      onNotificationsOpenChange={noRemovedAction}
      onNotifyChange={noRemovedAction}
      onMessageMember={noRemovedAction}
      onRemoveMember={noRemovedAction}
      onLeave={noRemovedAction}
    />
  );
}

function useMembershipControls(
  { detail, onClose, onNotice }: ActiveInfoProps,
  action: GroupAction,
) {
  const leave = useMutation(api.groups.leave);
  const remove = useMutation(api.groups.removeMember);
  const navigate = useNavigate();
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  function confirm() {
    if (!confirmation) return;
    void action.run(async () => {
      if (confirmation.kind === "leave") {
        await leave({ groupId: detail.groupId });
        await navigate({ to: "/", search: { group: undefined, authError: undefined } });
        onClose();
      } else {
        await remove({ groupId: detail.groupId, profileId: confirmation.member.id });
        onNotice(`${confirmation.member.fullName} was removed`);
      }
      setConfirmation(null);
    });
  }
  function close() {
    if (action.pending) return;
    setConfirmation(null);
    action.clearError();
  }
  function removeMember(member: Member) {
    const person = detail.members.find((p) => p.id === member.id);
    if (!person) return;
    action.clearError();
    setConfirmation({ kind: "remove", member: person });
  }
  function leaveGroup() {
    action.clearError();
    setConfirmation({ kind: "leave" });
  }
  return { confirmation, confirm, close, removeMember, leaveGroup };
}

function notificationNotice(mode: NotifyMode, title: string) {
  if (mode === "all") return "Notifications: all messages";
  return `${title} is ${mode === "muted" ? "muted" : "unmuted"}`;
}

function MembershipConfirmation({
  controls,
  action,
  title,
}: {
  readonly controls: ReturnType<typeof useMembershipControls>;
  readonly action: GroupAction;
  readonly title: string;
}) {
  const props = {
    groupTitle: title,
    onConfirm: controls.confirm,
    onClose: controls.close,
    pending: action.pending,
    error: action.error,
  };
  if (!controls.confirmation)
    return (
      <>
        {action.error ? <p role="alert">{action.error}</p> : null}
        {action.pending ? <output>Saving…</output> : null}
      </>
    );
  return controls.confirmation.kind === "leave" ? (
    <LeaveGroupDialog {...props} />
  ) : (
    <RemoveMemberDialog {...props} name={controls.confirmation.member.fullName} />
  );
}

function ActiveGroupInfo(props: ActiveInfoProps) {
  const { group, detail, onClose, onAdd, onCopy, copied, onMessage, unavailable, onNotice } = props;
  const { root } = useRoot();
  const notify = useMutation(api.groups.setNotify);
  const action = useGroupAction();
  const controls = useMembershipControls(props, action);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  function changeNotify(mode: NotifyMode) {
    setNotificationsOpen(false);
    void action.run(async () => {
      await notify({ groupId: detail.groupId, notify: mode });
      onNotice(notificationNotice(mode, group.title));
    });
  }
  function messageMember(member: Member) {
    const person = detail.members.find((p) => p.id === member.id);
    if (person) onMessage(person.id);
  }
  return (
    <>
      <GroupInfo
        group={group}
        onClose={onClose}
        onAddPeople={() => onAdd(detail)}
        inviteUrl={`${root?.ownerDocument.location.origin ?? ""}/join/${detail.inviteToken ?? ""}`}
        onCopyLink={onCopy}
        linkCopied={copied}
        onSearch={unavailable}
        notificationsOpen={notificationsOpen}
        onNotificationsOpenChange={setNotificationsOpen}
        onNotifyChange={changeNotify}
        onMessageMember={messageMember}
        onRemoveMember={controls.removeMember}
        onLeave={controls.leaveGroup}
      />
      <MembershipConfirmation controls={controls} action={action} title={group.title} />
    </>
  );
}

export function RemovedWorkspace({
  group,
  groupId,
  onInfo,
}: {
  readonly groupId: Id<"groups">;
  readonly onInfo: () => void;
  readonly group: RemovedGroup;
}) {
  const dismiss = useMutation(api.groups.dismissRemoval);
  const navigate = useNavigate();
  const action = useGroupAction();
  return (
    <>
      <ChatHeader group={group} onOpenInfo={onInfo} onSearchGroup={() => {}} />
      <RemovedGroupNotice
        group={group}
        pending={action.pending}
        error={action.error}
        onForget={() => {
          void action.run(async () => {
            await dismiss({ groupId });
            await navigate({ to: "/", search: { group: undefined, authError: undefined } });
          });
        }}
      />
      <ReadOnlyComposer />
    </>
  );
}
