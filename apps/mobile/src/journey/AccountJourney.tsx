import { api } from "@q9chat/convex";
import { firstName } from "@q9chat/domain";
import { useConvexConnectionState, useMutation } from "convex/react";
import { usePreventRemove, useRouter } from "expo-router";
import { useRef, useState } from "react";

import { useToast } from "../kit/useToast";
import { AccountScreen } from "../screens/AccountScreen";
import { sessionClient } from "../session/client";
import { config } from "../session/config";
import type { SignInMethod } from "../session/contracts";
import type { Me } from "../types";
import { profileAvatar } from "./groupRows";
import { leaveScreen } from "./leaveScreen";
import { usePhoneNotifications } from "./PhoneNotifications";
import { phoneWrite } from "./phoneWrite";
import { photoNoticeOf, pickPhoto, uploadPhoto } from "./photos";
import { useSignOut } from "./SignOut";
import { useNameEditing } from "./useNameEditing";
import type { ReadyProfile } from "./useStage";

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
  const push = usePhoneNotifications();
  const update = useMutation(api.profiles.update);
  const { isWebSocketConnected } = useConvexConnectionState();
  // A photo change in progress is held back like a name change: leaving would drop it.
  const [photoBusy, setPhotoBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const deleteBusy = useRef(false);
  const busy = useRef(false);
  const editing = useNameEditing({
    saved: profile.displayName,
    connected: isWebSocketConnected,
    save: (displayName) => update({ displayName }),
    photoBusy,
  });
  const [toast, showToast] = useToast();

  async function changePhoto() {
    if (busy.current) return;
    busy.current = true;
    setPhotoBusy(true);
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
      setPhotoBusy(false);
    }
  }

  async function deleteAccount() {
    if (deleteBusy.current) return;
    if (!isWebSocketConnected) {
      showToast("You're offline. Try again when you're back.");
      return;
    }
    deleteBusy.current = true;
    setDeleting(true);
    editing.clear();
    try {
      await push.unregister();
      await phoneWrite((client) => client.mutation(api.profiles.deleteAccount, {}));
    } catch {
      push.resume();
      showToast("Couldn't delete your account. Try again.");
      return;
    } finally {
      deleteBusy.current = false;
      setDeleting(false);
    }
    signOut.leave();
  }

  // Every way out (the header arrow, the iOS swipe, the Android Back) is held here until the name is saved and the photo change is done.
  usePreventRemove(editing.dirty || photoBusy, ({ repeat }) => {
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
          title: editing.unsaved.title,
          confirmLabel: editing.unsaved.confirmLabel,
          cancelLabel: editing.unsaved.cancelLabel,
          onKeepEditing: editing.keepEditing,
          onDiscard: editing.discard,
        }
      }
      hasPhoto={profile.photo !== null}
      onTogglePhoto={() => void changePhoto()}
      confirmDelete={confirmDelete}
      deleting={deleting}
      toast={toast}
      onBack={() => leaveScreen(router)}
      signingOut={signOut.signingOut}
      onSignOut={() => {
        // Sign out takes the same save-or-discard way out as the others; the draft is dropped so the redirect is not held back.
        void editing.exit(() => {
          editing.clear();
          signOut.leave();
        });
      }}
      onAskDelete={() => {
        if (photoBusy) showToast("Wait for your photo to finish saving.");
        else setConfirmDelete(true);
      }}
      onConfirmDelete={() => void deleteAccount()}
      onCancelDelete={() => {
        if (!deleteBusy.current) setConfirmDelete(false);
      }}
    />
  );
}
