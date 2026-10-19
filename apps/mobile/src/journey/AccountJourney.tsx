import { api } from "@q9chat/convex";
import { firstName } from "@q9chat/domain";
import { useConvexConnectionState, useMutation } from "convex/react";
import { usePreventRemove, useRouter } from "expo-router";
import { useRef } from "react";

import { useToast } from "../kit/useToast";
import { AccountScreen } from "../screens/AccountScreen";
import { sessionClient } from "../session/client";
import { config } from "../session/config";
import type { SignInMethod } from "../session/contracts";
import type { Me } from "../types";
import { profileAvatar } from "./groupRows";
import { photoNoticeOf, pickPhoto, uploadPhoto } from "./photos";
import { useSignOut } from "./SignOut";
import { useNameEditing } from "./useNameEditing";
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
  const { isWebSocketConnected } = useConvexConnectionState();
  const editing = useNameEditing(profile.displayName, isWebSocketConnected, (displayName) =>
    update({ displayName }),
  );
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
      showToast(photoNoticeOf(error) ?? "Couldn't update your photo. Try again.");
    } finally {
      busy.current = false;
    }
  }

  // Every way out (the header arrow, the iOS swipe, the Android Back) is held here until the name is saved.
  usePreventRemove(editing.dirty, ({ repeat }) => {
    void editing.exit(repeat);
  });

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
      name={editing.name}
      onNameChange={editing.change}
      nameSaving={editing.saving}
      unsaved={
        editing.unsaved && {
          text: editing.unsaved.text,
          confirmLabel: editing.unsaved.confirmLabel,
          cancelLabel: editing.unsaved.cancelLabel,
          onKeepEditing: editing.keepEditing,
          onDiscard: editing.discard,
        }
      }
      hasPhoto={profile.photo !== null}
      onTogglePhoto={() => void changePhoto()}
      confirmDelete={false}
      toast={toast}
      onBack={() => router.back()}
      signingOut={signOut.signingOut}
      onSignOut={() => {
        // Sign out takes the same save-or-discard way out as the others; the draft is dropped so the redirect is not held back.
        void editing.exit(() => {
          editing.clear();
          signOut.leave();
        });
      }}
      onAskDelete={() => showToast(COMING_NEXT)}
      onConfirmDelete={noop}
      onCancelDelete={noop}
    />
  );
}
