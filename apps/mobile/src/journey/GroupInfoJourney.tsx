import { api, type Id } from "@q9chat/convex";
import { useConvexConnectionState, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";

import { useToast } from "../kit/useToast";
import { InfoScreen, type InfoSheet } from "../screens/InfoScreen";
import { config } from "../session/config";
import { canMessage, groupError, membershipLost } from "./groupRules";
import { GroupUnavailable } from "./GroupUnavailable";
import { leaveScreen } from "./leaveScreen";
import { liveAvatar, livePerson } from "./livePeople";
import { Loading } from "./Loading";
import { takeNotice } from "./notice";
import { createWriteRun, moveOnSuccess, OFFLINE_NOTICE } from "./pendingWrite";
import { useCopied } from "./useCopied";
import { useGroupControls } from "./useGroupControls";
import { useOffline } from "./useOffline";

type Detail = Extract<NonNullable<FunctionReturnType<typeof api.groups.get>>, { status: "member" }>;

function GroupInfoView({ groupId, detail }: { groupId: Id<"groups">; detail: Detail }) {
  const router = useRouter();
  const openPair = useMutation(api.groups.openPair);
  const { isWebSocketConnected } = useConvexConnectionState();
  const [pairs] = useState(createWriteRun);
  const [sheet, setSheet] = useState<InfoSheet | null>(null);
  const [toast, showToast] = useToast();
  const { copied, copy } = useCopied();
  const controls = useGroupControls({
    groupId,
    showToast,
    closeSheet: () => setSheet(null),
    onLeave: () => router.dismissTo("/"),
  });
  // Add people leaves a line behind ("Added Elena") for this screen, which stays mounted under it.
  useFocusEffect(
    useCallback(() => {
      const notice = takeNotice();
      if (notice) showToast(notice);
    }, [showToast]),
  );

  // A pair that opens after this screen was left (Back, or another screen on top) must not pull the person into it.
  useFocusEffect(
    useCallback(
      () => () => {
        pairs.supersede();
      },
      [pairs],
    ),
  );

  const link = detail.inviteToken ? `${config.authOrigin}/join/${detail.inviteToken}` : null;
  async function copyLink() {
    if (link)
      showToast((await copy(link)) ? "Invite link copied" : "Couldn't copy the link. Try again.");
  }

  async function messageMember(personId: string) {
    const person = detail.members.find((member) => member.id === personId);
    if (!person || !canMessage(person)) return;
    setSheet(null);
    await moveOnSuccess(pairs, isWebSocketConnected, () => openPair({ profileId: person.id }), {
      offline: () => showToast(OFFLINE_NOTICE),
      moved: (pair) => router.replace({ pathname: "/g/[groupId]", params: { groupId: pair } }),
      failed: (error) => showToast(groupError(error)),
    });
  }

  return (
    <InfoScreen
      info={{
        status: "member",
        groupId: detail.groupId,
        kind: detail.kind,
        title: detail.title,
        avatar: liveAvatar(detail.avatar, detail.kind, config.siteUrl),
        memberCount: detail.memberCount,
        members: detail.members.map((member) => livePerson(member, config.siteUrl)),
        notify: detail.notify,
        inviteLink: link ? link.replace(/^https?:\/\//u, "") : null,
      }}
      sheet={sheet}
      copied={copied}
      toast={controls.pending ? "Saving…" : toast}
      busy={controls.pending}
      onBack={() => leaveScreen(router)}
      onAddPeople={() => router.push({ pathname: "/g/[groupId]/add", params: { groupId } })}
      onCopyLink={() => void copyLink()}
      onSearch={() => router.push({ pathname: "/search", params: { groupId } })}
      onOpenNotify={() => setSheet({ type: "notify" })}
      onChooseNotify={controls.chooseNotify}
      onToggleMute={(muted) => controls.chooseNotify(muted ? "muted" : "mentions")}
      onOpenMember={(personId) => setSheet({ type: "member", personId })}
      onMessageMember={(personId) => void messageMember(personId)}
      onAskRemove={(personId) => setSheet({ type: "removeMember", personId })}
      onConfirmRemove={(personId) => {
        const person = detail.members.find((member) => member.id === personId && !member.isYou);
        if (person) controls.removeMember(person);
      }}
      onAskLeave={() => setSheet({ type: "leave" })}
      onConfirmLeave={controls.leave}
      onCloseSheet={() => setSheet(null)}
    />
  );
}

/** Live membership and notification controls over the existing Group info sheets. */
export function GroupInfoJourney({ groupId }: { groupId: Id<"groups"> }) {
  const router = useRouter();
  const detail = useQuery(api.groups.get, { groupId });
  const offline = useOffline();
  // The pane closes by itself when the group stops being yours.
  const gone = membershipLost(detail);
  useEffect(() => {
    if (gone) router.dismissTo("/");
  }, [gone, router]);
  // Offline with nothing cached the lookup cannot answer, so say so, with a way back, as the group screen does.
  if (detail === undefined && offline) return <GroupUnavailable denied={false} />;
  if (!detail || detail.status !== "member") return <Loading />;
  return <GroupInfoView groupId={groupId} detail={detail} />;
}
