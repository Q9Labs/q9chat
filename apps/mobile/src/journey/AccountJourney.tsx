import { api } from "@q9chat/convex";
import { firstName } from "@q9chat/domain";
import { useMutation } from "convex/react";
import { useRouter } from "expo-router";
import { useRef, useState } from "react";

import { useToast } from "../kit/useToast";
import { AccountScreen } from "../screens/AccountScreen";
import { sessionClient } from "../session/client";
import { config } from "../session/config";
import type { SignInMethod } from "../session/contracts";
import type { Me } from "../types";
import { profileAvatar } from "./groupRows";
import { photoRejectedNotice } from "./photoRules";
import { isPhotoRejection, pickPhoto, uploadPhoto } from "./photos";
import { useSignOut } from "./SignOut";
import type { ReadyProfile } from "./useStage";

const noop = () => {};
const COMING_NEXT = "This is coming in the next journey.";
const providerLabel = (method: SignInMethod): Me["signedInWith"] =>
  method === "google" ? "Google" : method === "apple" ? "Apple" : "Email code";

/** Account: name and photo changes save as they are made, Sign out ends the session. */
export function AccountJourney({
  profile,
  method,
}: {
  profile: ReadyProfile;
  method: SignInMethod;
}) {
  const router = useRouter();
  const signOut = useSignOut();
  const update = useMutation(api.profiles.update);
  const [draft, setName] = useState<string | null>(null);
  const name = draft ?? profile.displayName;
  const [toast, showToast] = useToast();
  const busy = useRef(false);

  async function changePhoto() {
    if (busy.current) return;
    busy.current = true;
    try {
      if (profile.photo) {
        await update({ photoUploadId: null });
        return;
      }
      const picked = await pickPhoto();
      if (picked.kind === "refused") showToast(picked.notice);
      if (picked.kind !== "picked") return;
      const token = await sessionClient.fetchAccessToken({ forceRefreshToken: false });
      await update({ photoUploadId: await uploadPhoto(picked.photo, token) });
    } catch (error) {
      showToast(
        isPhotoRejection(error) ? photoRejectedNotice : "Couldn't update your photo. Try again.",
      );
    } finally {
      busy.current = false;
    }
  }

  async function leaveAccount() {
    if (busy.current) return;
    const displayName = name.trim();
    if (displayName === profile.displayName) {
      router.back();
      return;
    }
    busy.current = true;
    try {
      await update({ displayName });
      router.back();
    } catch {
      showToast("Enter a name of 1 to 60 characters.");
    } finally {
      busy.current = false;
    }
  }

  return (
    <AccountScreen
      me={{
        person: {
          id: profile.id,
          name: firstName(profile.displayName),
          fullName: profile.displayName,
          email: profile.email,
          avatar: profileAvatar(profile, config.siteUrl),
          isYou: true,
        },
        signedInWith: providerLabel(method),
      }}
      name={name}
      onNameChange={setName}
      hasPhoto={profile.photo !== null}
      onTogglePhoto={() => void changePhoto()}
      confirmDelete={false}
      toast={toast}
      onBack={() => void leaveAccount()}
      onSignOut={signOut.leave}
      onAskDelete={() => showToast(COMING_NEXT)}
      onConfirmDelete={noop}
      onCancelDelete={noop}
    />
  );
}
