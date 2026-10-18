import { firstName } from "@q9chat/domain";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";

import { PillButton } from "../kit/Buttons";
import { CenterState } from "../kit/Chrome";
import { Screen } from "../kit/Chrome";
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

/** Journey 1: sign in, set up the profile the first time, and land in your groups. */
export function Journey() {
  const stage = useStage();
  const { authError } = useLocalSearchParams<{ authError?: string }>();
  // Setup stays on screen while the profile saves, even after the profile exists.
  const [saving, setSaving] = useState(false);
  if (stage.kind === "loading") return <Loading />;
  if (stage.kind === "signedOut") return <SignInJourney authError={authError === "1"} />;
  if (stage.kind === "unavailable") return <AccountUnavailable />;
  if (stage.kind === "needsSetup" || saving)
    return (
      <SetupJourney
        session={stage.session}
        onStarted={() => setSaving(true)}
        onFinished={(displayName) => {
          postNotice(`Welcome, ${firstName(displayName)}`);
          setSaving(false);
        }}
      />
    );
  return <GroupsJourney profile={stage.profile} />;
}
