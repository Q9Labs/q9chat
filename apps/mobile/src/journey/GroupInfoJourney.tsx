import { api, type Id } from "@q9chat/convex";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";

import { useToast } from "../kit/useToast";
import { InfoScreen, type InfoSheet } from "../screens/InfoScreen";
import { config } from "../session/config";
import { canMessage, groupError, membershipLost } from "./groupRules";
import { leaveScreen } from "./leaveScreen";
import { liveAvatar, livePerson } from "./livePeople";
import { Loading } from "./Loading";
import { takeNotice } from "./notice";
import { useCopied } from "./useCopied";

const COMING_NEXT = "This is coming in the next journey.";

type Detail = Extract<NonNullable<FunctionReturnType<typeof api.groups.get>>, { status: "member" }>;

function GroupInfoView({ groupId, detail }: { groupId: Id<"groups">; detail: Detail }) {
  const router = useRouter();
  const openPair = useMutation(api.groups.openPair);
  const [sheet, setSheet] = useState<InfoSheet | null>(null);
  const [toast, showToast] = useToast();
  const { copied, copy } = useCopied();
  // Add people leaves a line behind ("Added Elena") for this screen, which stays mounted under it.
  useFocusEffect(
    useCallback(() => {
      const notice = takeNotice();
      if (notice) showToast(notice);
    }, [showToast]),
  );

  const link = detail.inviteToken ? `${config.authOrigin}/join/${detail.inviteToken}` : null;
  const soon = () => showToast(COMING_NEXT);

  async function copyLink() {
    if (link)
      showToast((await copy(link)) ? "Invite link copied" : "Couldn't copy the link. Try again.");
  }

  async function messageMember(personId: string) {
    const person = detail.members.find((member) => member.id === personId);
    if (!person || !canMessage(person)) return;
    setSheet(null);
    try {
      const pair = await openPair({ profileId: person.id });
      router.replace({ pathname: "/g/[groupId]", params: { groupId: pair } });
    } catch (error) {
      showToast(groupError(error));
    }
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
      toast={toast}
      onBack={() => leaveScreen(router)}
      onAddPeople={() => router.push({ pathname: "/g/[groupId]/add", params: { groupId } })}
      onCopyLink={() => void copyLink()}
      onSearch={soon}
      onOpenNotify={soon}
      onChooseNotify={soon}
      onToggleMute={soon}
      onOpenMember={(personId) => setSheet({ type: "member", personId })}
      onMessageMember={(personId) => void messageMember(personId)}
      onAskRemove={() => {
        setSheet(null);
        soon();
      }}
      onConfirmRemove={soon}
      onAskLeave={soon}
      onConfirmLeave={soon}
      onCloseSheet={() => setSheet(null)}
    />
  );
}

/** Group info over the live group. Notifications, search, removing and leaving come with later journeys. */
export function GroupInfoJourney({ groupId }: { groupId: Id<"groups"> }) {
  const router = useRouter();
  const detail = useQuery(api.groups.get, { groupId });
  // The pane closes by itself when the group stops being yours.
  const gone = membershipLost(detail);
  useEffect(() => {
    if (gone) leaveScreen(router);
  }, [gone, router]);
  if (!detail || detail.status !== "member") return <Loading />;
  return <GroupInfoView groupId={groupId} detail={detail} />;
}
