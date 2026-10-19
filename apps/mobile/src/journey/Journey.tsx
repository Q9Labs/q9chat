import { firstName } from "@q9chat/domain";
import { useRouter } from "expo-router";
import { useEffect, useState, useSyncExternalStore } from "react";

import { PillButton } from "../kit/Buttons";
import { CantConnectYet, CenterState, OfflinePill } from "../kit/Chrome";
import { Screen } from "../kit/Chrome";
import { OfflineRestoreScreen } from "../screens/AuthScreens";
import { sessionClient } from "../session/client";
import { GroupsJourney } from "./GroupsJourney";
import { JoinJourney } from "./JoinJourney";
import { Loading } from "./Loading";
import { postNotice } from "./notice";
import { SetupJourney } from "./SetupJourney";
import { savingSetup, type SetupSaving } from "./setupRules";
import { SignInJourney } from "./SignInJourney";
import { useSignOut } from "./SignOut";
import { useSavedInvite } from "./useSavedInvite";
import { useStage } from "./useStage";

function AccountUnavailable() {
  const signOut = useSignOut();
  return (
    <Screen>
      <CenterState
        icon="ban"
        title="We couldn't open your account"
        text="Please sign in again."
        action={<PillButton label="Sign out" onPress={signOut.leave} />}
      />
    </Screen>
  );
}

function CantConnect() {
  const signOut = useSignOut();
  return (
    <OfflineRestoreScreen onRetry={() => void sessionClient.retry()} onSignOut={signOut.leave} />
  );
}

/** The account is still loading and the connection is down: the same offline line and message as Groups. */
function Disconnected() {
  const signOut = useSignOut();
  return (
    <Screen>
      <OfflinePill />
      <CantConnectYet action={<PillButton label="Sign out" onPress={signOut.leave} />} />
    </Screen>
  );
}

/** What shows while there is no profile to look at yet. */
const WITHOUT_PROFILE = {
  loading: Loading,
  disconnected: Disconnected,
  offline: CantConnect,
  unavailable: AccountUnavailable,
} as const;

/**
 * Journey 1: sign in, set up the profile the first time, and land in your groups. Given an invite
 * token it ends at the invite instead. The invite is kept while signing in, so OAuth and a killed app
 * still arrive at it; the Groups screen picks it up when sign-in returns there.
 */
export function Journey({ invite }: { invite?: string }) {
  const stage = useStage();
  const router = useRouter();
  const ready = stage.kind === "ready";
  useSavedInvite(invite, ready, sessionClient);
  useEffect(() => {
    let live = true;
    if (!invite && ready)
      void sessionClient
        .takeInvite()
        .then((token) => {
          if (live && token) router.replace({ pathname: "/join/[token]", params: { token } });
        })
        // A keychain that cannot be read leaves the person on Groups, with no invite to follow.
        .catch(() => {});
    return () => {
      live = false;
    };
  }, [invite, ready, router]);
  // Setup stays on screen while that account's profile saves, even after the profile exists; another account, or the same one after a sign-out, never inherits it.
  const [saving, setSaving] = useState<SetupSaving>(null);
  const epoch = useSyncExternalStore(sessionClient.subscribe, sessionClient.epoch);
  if (stage.kind === "signedOut") return <SignInJourney invite={invite} />;
  if (stage.kind !== "needsSetup" && stage.kind !== "ready") {
    const View = WITHOUT_PROFILE[stage.kind];
    return <View />;
  }
  const userId = stage.session.user.id;
  const endSaving = () => setSaving((current) => (current?.userId === userId ? null : current));
  if (stage.kind === "needsSetup" || savingSetup(saving, userId, epoch))
    return (
      <SetupJourney
        key={userId}
        session={stage.session}
        onStarted={() => setSaving({ userId, epoch })}
        onFinished={(displayName) => {
          postNotice(`Welcome, ${firstName(displayName)}`);
          endSaving();
        }}
        onStopped={endSaving}
      />
    );
  return invite ? <JoinJourney token={invite} /> : <GroupsJourney profile={stage.profile} />;
}
