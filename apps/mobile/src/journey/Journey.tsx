import { firstName } from "@q9chat/domain";
import { useState } from "react";

import { PillButton } from "../kit/Buttons";
import { CantConnectYet, CenterState, OfflinePill } from "../kit/Chrome";
import { Screen } from "../kit/Chrome";
import { sessionClient } from "../session/client";
import { GroupsJourney } from "./GroupsJourney";
import { Loading } from "./Loading";
import { postNotice } from "./notice";
import { SetupJourney } from "./SetupJourney";
import { SignInJourney } from "./SignInJourney";
import { useSignOut } from "./SignOut";
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
  return (
    <Screen>
      <CenterState
        icon="ban"
        title="Can't connect. Try again."
        text="Your sign-in is saved. Check your connection and try again."
        action={<PillButton label="Try again" onPress={() => void sessionClient.retry()} />}
      />
    </Screen>
  );
}

/** The account is still loading and the connection is down: the same offline line and message as Groups. */
function Disconnected() {
  return (
    <Screen>
      <OfflinePill />
      <CantConnectYet />
    </Screen>
  );
}

/** What shows while there is no profile to look at yet. */
const WITHOUT_PROFILE = {
  loading: Loading,
  signedOut: SignInJourney,
  disconnected: Disconnected,
  offline: CantConnect,
  unavailable: AccountUnavailable,
} as const;

/** Journey 1: sign in, set up the profile the first time, and land in your groups. */
export function Journey() {
  const stage = useStage();
  // Setup stays on screen while that account's profile saves, even after the profile exists; another account never inherits it.
  const [savingFor, setSavingFor] = useState<string | null>(null);
  if (stage.kind !== "needsSetup" && stage.kind !== "ready") {
    const View = WITHOUT_PROFILE[stage.kind];
    return <View />;
  }
  const userId = stage.session.user.id;
  if (stage.kind === "needsSetup" || savingFor === userId)
    return (
      <SetupJourney
        key={userId}
        session={stage.session}
        onStarted={() => setSavingFor(userId)}
        onFinished={(displayName) => {
          postNotice(`Welcome, ${firstName(displayName)}`);
          setSavingFor((current) => (current === userId ? null : current));
        }}
        onStopped={() => setSavingFor((current) => (current === userId ? null : current))}
      />
    );
  return <GroupsJourney profile={stage.profile} />;
}
