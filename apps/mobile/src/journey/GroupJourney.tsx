import { api, type Id } from "@q9chat/convex";
import { useConvexConnectionState, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { usePreventRemove, useRouter } from "expo-router";
import { useEffect } from "react";

import { useToast } from "../kit/useToast";
import { GroupScreen } from "../screens/GroupScreen";
import { config } from "../session/config";
import { removedWhen } from "./groupRows";
import { GroupUnavailable } from "./GroupUnavailable";
import { leaveScreen } from "./leaveScreen";
import { LiveHistory } from "./LiveHistory";
import { liveAvatar } from "./livePeople";
import { Loading } from "./Loading";
import { useGuardedWrite } from "./useGuardedWrite";
import { useOffline } from "./useOffline";

const COMING_NEXT = "This is coming in the next journey.";

type Detail = NonNullable<FunctionReturnType<typeof api.groups.get>>;

function GroupView({ groupId, detail }: { groupId: Id<"groups">; detail: Detail }) {
  const router = useRouter();
  const [toast, showToast] = useToast();
  const offline = useOffline();
  const { isWebSocketConnected } = useConvexConnectionState();
  const forgetRemoval = useMutation(api.groups.dismissRemoval);
  const guarded = useGuardedWrite(isWebSocketConnected);
  const release = usePreventRemove(guarded.holding, guarded.onRemove);
  const failed = guarded.phase.kind === "failed" ? guarded.phase.message : null;
  // A failed removal from the list says so in a line that goes away, like every other notice here.
  useEffect(() => {
    if (failed) showToast(failed);
  }, [failed, showToast]);
  const base = {
    title: detail.title,
    avatar: liveAvatar(
      detail.avatar,
      detail.status === "member" ? detail.kind : "group",
      config.siteUrl,
    ),
    offline,
    toast,
    onBack: () => leaveScreen(router),
    onOpenInfo: () => router.push({ pathname: "/g/[groupId]/info", params: { groupId } }),
    onSearch: () => showToast(COMING_NEXT),
    // The removed group stays in Groups until it is taken off the list, then Groups is where this goes back to.
    onForget: () =>
      guarded.submit(
        () => forgetRemoval({ groupId }),
        () => {
          release();
          router.dismissTo("/");
        },
        () => "Couldn't remove it. Try again.",
      ),
    leavePrompt: guarded.prompt,
  };
  if (detail.status === "removed")
    return (
      <GroupScreen
        {...base}
        subtitle={null}
        muted={false}
        removed={{ by: detail.removedBy.name, when: removedWhen(detail.removedAt, new Date()) }}
        items={[]}
      />
    );
  return (
    <GroupScreen
      {...base}
      subtitle={null}
      muted={detail.notify === "muted"}
      removed={null}
      items={[]}
      history={<LiveHistory key={groupId} group={detail} />}
    />
  );
}

/** Open a live group, or replace its history immediately after removal. */
export function GroupJourney({ groupId }: { groupId: Id<"groups"> }) {
  const offline = useOffline();
  const detail = useQuery(api.groups.get, { groupId });
  if (detail === undefined && !offline) return <Loading />;
  if (!detail) return <GroupUnavailable denied={detail === null} />;
  return <GroupView groupId={groupId} detail={detail} />;
}
