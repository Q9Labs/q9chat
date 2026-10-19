import { api } from "@q9chat/convex";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";

import { PillButton } from "../kit/Buttons";
import { CenterState, PageNav, Screen } from "../kit/Chrome";
import { isInviteToken } from "../session/storage";
import { T } from "../theme/Text";
import { groupError, invalidInviteCopy, removedInviteCopy, type Phase } from "./groupRules";
import { Loading } from "./Loading";

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

function useJoin(token: string, router: Router) {
  const join = useMutation(api.groups.join);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const busy = useRef(false);
  async function accept() {
    if (busy.current) return;
    busy.current = true;
    setPhase({ kind: "pending" });
    try {
      const groupId = await join({ token });
      openGroup(router, groupId);
    } catch (cause) {
      busy.current = false;
      setPhase({ kind: "failed", message: groupError(cause) });
    }
  }
  return { phase, accept: () => void accept() };
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

/** A link to a group: who it is, and one button to join. */
export function JoinJourney({ token }: { token: string }) {
  const router = useRouter();
  const view = useInvite(token);
  useSettled(view, router);
  const { phase, accept } = useJoin(token, router);
  if (view.kind === "loading" || view.kind === "member") return <Loading />;
  const close = () => router.dismissTo("/");
  return (
    <Screen>
      <PageNav title="" start={{ back: true, onPress: close }} />
      {view.kind === "card" ? (
        <InviteCard info={view.info} phase={phase} onJoin={accept} />
      ) : (
        <CenterState icon="mail" title="Link not valid" text={invalidInviteCopy} />
      )}
    </Screen>
  );
}
