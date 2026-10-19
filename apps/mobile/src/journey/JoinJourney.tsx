import { api } from "@q9chat/convex";
import { useConvexConnectionState, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { usePreventRemove, useRouter } from "expo-router";
import { useEffect } from "react";

import { PillButton } from "../kit/Buttons";
import { CenterState, PageNav, Screen } from "../kit/Chrome";
import { WriteExitSheet } from "../kit/WriteExitSheet";
import { isInviteToken } from "../session/storage";
import { T } from "../theme/Text";
import { groupError, invalidInviteCopy, removedInviteCopy, type Phase } from "./groupRules";
import { Loading } from "./Loading";
import { useGuardedWrite } from "./useGuardedWrite";
import { useOffline } from "./useOffline";

type Router = ReturnType<typeof useRouter>;
type InviteInfo = FunctionReturnType<typeof api.groups.inviteInfo>;
type Card = Exclude<InviteInfo, null | { status: "member" }>;
type View =
  | { kind: "loading" }
  | { kind: "invalid" }
  | { kind: "member"; groupId: string }
  | { kind: "card"; info: Card };

/** Groups at the bottom of the stack and the group above it, so Back from the group lands on Groups. */
function openGroup(router: Router, groupId: string) {
  router.dismissTo("/");
  router.push({ pathname: "/g/[groupId]", params: { groupId } });
}

function viewOf(info: InviteInfo | undefined): View {
  if (info === null) return { kind: "invalid" };
  if (info === undefined) return { kind: "loading" };
  if (info.status === "member") return { kind: "member", groupId: info.groupId };
  return { kind: "card", info };
}

/** What the link says; a link that cannot be read is invalid without asking. */
function useInvite(token: string): View {
  const valid = isInviteToken(token);
  const info = useQuery(api.groups.inviteInfo, valid ? { token } : "skip");
  return valid ? viewOf(info) : { kind: "invalid" };
}

/** Someone who is already in the group goes straight to it. */
function useSettled(view: View, router: Router) {
  const groupId = view.kind === "member" ? view.groupId : null;
  useEffect(() => {
    if (groupId) openGroup(router, groupId);
  }, [groupId, router]);
}

/** Join is one write behind the button, held like create and add: Back waits for it, or asks when it may not end. */
function useJoin(token: string, router: Router) {
  const join = useMutation(api.groups.join);
  const { isWebSocketConnected } = useConvexConnectionState();
  const guarded = useGuardedWrite(isWebSocketConnected);
  const release = usePreventRemove(guarded.holding, guarded.onRemove);
  return {
    ...guarded,
    accept: () =>
      guarded.submit(
        () => join({ token }),
        (groupId) => {
          // Release first: a held dismissTo would run again after the push below and pop the group.
          release();
          openGroup(router, groupId);
        },
        groupError,
      ),
  };
}

/** The same words as the invite page on the web. */
function InviteCard({ info, phase, onJoin }: { info: Card; phase: Phase; onJoin: () => void }) {
  if (info.status === "removed")
    return <CenterState icon="ban" title="You can't join this group" text={removedInviteCopy} />;
  return (
    <>
      <CenterState
        icon="users"
        title={`Join ${info.title}`}
        text={`${info.memberCount} members\nJoin to read and write in this group.`}
        action={
          <PillButton
            label="Join group"
            variant="solid"
            size="big"
            disabled={phase.kind === "pending"}
            onPress={onJoin}
          />
        }
      />
      {phase.kind === "failed" ? (
        <T color="mu" accessibilityRole="alert" style={{ textAlign: "center", padding: 16 }}>
          {phase.message}
        </T>
      ) : null}
    </>
  );
}

/** A link to a group: who it is, and one button to join. The header's Back stays through the lookup, so a link never traps. */
export function JoinJourney({ token }: { token: string }) {
  const router = useRouter();
  const offline = useOffline();
  const view = useInvite(token);
  useSettled(view, router);
  const { phase, stand, prompt, accept } = useJoin(token, router);
  const close = () => router.dismissTo("/");
  if (view.kind === "member") return <Loading />;
  return (
    <Screen>
      <PageNav title="" start={{ back: true, onPress: close, disabled: stand === "locked" }} />
      {view.kind === "loading" ? (
        offline ? (
          <CenterState
            icon="wifiOff"
            title="Can't connect"
            text="This invite will load when you're back online."
          />
        ) : (
          <Loading />
        )
      ) : view.kind === "card" ? (
        <InviteCard info={view.info} phase={phase} onJoin={accept} />
      ) : (
        <CenterState icon="mail" title="Link not valid" text={invalidInviteCopy} />
      )}
      {prompt ? (
        <WriteExitSheet
          title="You haven't joined yet"
          onLeave={prompt.leave}
          onStay={prompt.stay}
        />
      ) : null}
    </Screen>
  );
}
