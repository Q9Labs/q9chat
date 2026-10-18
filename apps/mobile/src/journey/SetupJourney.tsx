import { api } from "@q9chat/convex";
import { avatarColors, initials } from "@q9chat/domain";
import { useAction, useMutation } from "convex/react";
import { useRef, useState } from "react";

import { useToast } from "../kit/useToast";
import { ProfileScreen } from "../screens/AuthScreens";
import { sessionClient, type Session } from "../session/client";
import { MAX_NAME } from "./nameRules";
import { photoNoticeOf, pickPhoto, type PickedPhoto, uploadPhoto } from "./photos";

/** The `photoUploadId` field for the chosen photo, or nothing when there is none. */
async function uploadedPhoto(photo: PickedPhoto | null) {
  if (!photo) return {};
  const token = await sessionClient.fetchAccessToken({ forceRefreshToken: false });
  return { photoUploadId: await uploadPhoto(photo, token) };
}

/** First sign-in: a name (required, up to 60 characters) and an optional photo, then Groups. */
export function SetupJourney({
  session,
  onStarted,
  onFinished,
}: {
  session: Session;
  onStarted: () => void;
  onFinished: (displayName: string) => void;
}) {
  const { user } = session;
  const setUp = useAction(api.profiles.setUp);
  const update = useMutation(api.profiles.update);
  const [name, setName] = useState(() => [user.firstName, user.lastName].filter(Boolean).join(" "));
  const [photo, setPhoto] = useState<PickedPhoto | null>(null);
  const [toast, showToast] = useToast();
  const working = useRef(false);

  async function save() {
    const displayName = name.trim();
    if (working.current || !displayName) return;
    if (displayName.length > MAX_NAME) {
      showToast("Your name must be 60 characters or fewer.");
      return;
    }
    working.current = true;
    onStarted();
    try {
      await setUp({ displayName });
      // setUp is idempotent: a failed photo upload can retry without creating another profile.
      await update({ displayName, ...(await uploadedPhoto(photo)) });
      onFinished(displayName);
    } catch (error) {
      const notice = photoNoticeOf(error);
      if (notice) setPhoto(null);
      showToast(notice ?? "Couldn't save your profile. Try again.");
    } finally {
      working.current = false;
    }
  }

  async function togglePhoto() {
    if (working.current) return;
    if (photo) {
      setPhoto(null);
      return;
    }
    const picked = await pickPhoto();
    if (picked.kind === "picked") setPhoto(picked.photo);
    if (picked.kind === "refused") showToast(picked.notice);
  }

  const { color, lightColor } = avatarColors(user.id);
  return (
    <ProfileScreen
      email={user.email}
      name={name}
      onNameChange={(value) => {
        if (!working.current) setName(value);
      }}
      avatar={{
        kind: "person",
        initials: initials(name),
        color,
        colorOnDark: lightColor,
        photoUrl: photo?.uri ?? null,
      }}
      hasPhoto={photo !== null}
      onTogglePhoto={() => void togglePhoto()}
      onContinue={() => void save()}
      notice={toast ? { text: toast } : null}
    />
  );
}
