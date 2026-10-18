import { api } from "@q9chat/convex";
import { avatarColor, initials } from "@q9chat/domain";
import { useAction, useMutation } from "convex/react";
import { useEffect, useRef, useState } from "react";

import { useSession } from "../lib/session.js";
import { SetUpProfile } from "../screens/auth.js";
import { Toast } from "../ui/overlay.js";
import { uploadPhoto } from "./photos.js";

type SessionUser = NonNullable<ReturnType<typeof useSession>["user"]>;

export function ProfileSetup({
  user,
  onFinished,
}: {
  readonly user: SessionUser;
  readonly onFinished: () => void;
}) {
  const { fetchAccessToken } = useSession();
  const setUp = useAction(api.profiles.setUp);
  const update = useMutation(api.profiles.update);
  const [name, setName] = useState(() => [user.firstName, user.lastName].filter(Boolean).join(" "));
  const [photo, setPhoto] = useState<{ readonly file: File; readonly url: string } | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const working = useRef(false);
  const picker = useRef<HTMLInputElement>(null);
  useEffect(
    () => () => {
      if (photo) URL.revokeObjectURL(photo.url);
    },
    [photo],
  );

  async function save() {
    if (working.current || !name.trim()) return;
    if (name.trim().length > 60) {
      setNotice("Your name must be 60 characters or fewer.");
      return;
    }
    working.current = true;
    setBusy(true);
    setNotice("");
    try {
      await setUp({ displayName: name.trim() });
      // setUp is idempotent: a failed photo upload can retry without creating another profile.
      await update({
        displayName: name.trim(),
        ...(photo
          ? {
              photoUploadId: await uploadPhoto(
                photo.file,
                await fetchAccessToken({ forceRefreshToken: false }),
              ),
            }
          : {}),
      });
      onFinished();
    } catch {
      setNotice("Couldn't save your profile. Try again.");
    } finally {
      working.current = false;
      setBusy(false);
    }
  }

  return (
    <div aria-busy={busy}>
      <input
        ref={picker}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        hidden
        aria-label="Profile photo"
        onChange={(event) => {
          const file = event.target.files?.[0];
          setPhoto(file ? { file, url: URL.createObjectURL(file) } : null);
          event.target.value = "";
        }}
      />
      <SetUpProfile
        name={name}
        onNameChange={(value) => {
          if (!working.current) setName(value);
        }}
        email={user.email}
        avatar={{
          initials: initials(name),
          color: avatarColor(user.id),
          photoUrl: photo?.url ?? null,
        }}
        onTogglePhoto={() => {
          if (!working.current) {
            if (photo) setPhoto(null);
            else picker.current?.click();
          }
        }}
        onContinue={() => void save()}
      />
      {notice ? <Toast message={notice} /> : null}
    </div>
  );
}
