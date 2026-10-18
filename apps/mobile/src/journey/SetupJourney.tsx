import { api } from "@q9chat/convex";
import { avatarColors, initials } from "@q9chat/domain";
import { useAction, useMutation } from "convex/react";
import { useRef, useState } from "react";

import { useToast } from "../kit/useToast";
import { ProfileScreen } from "../screens/AuthScreens";
import { sessionClient, type Session } from "../session/client";
import { photoRejectedNotice } from "./photoRules";
import { isPhotoRejection, pickPhoto, type PickedPhoto, uploadPhoto } from "./photos";

const MAX_NAME = 60;

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
      await update({
        displayName,
        ...(photo
          ? {
              photoUploadId: await uploadPhoto(
                photo,
                await sessionClient.fetchAccessToken({ forceRefreshToken: false }),
              ),
            }
          : {}),
      });
      onFinished(displayName);
    } catch (error) {
      if (isPhotoRejection(error)) {
        setPhoto(null);
        showToast(photoRejectedNotice);
      } else showToast("Couldn't save your profile. Try again.");
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
