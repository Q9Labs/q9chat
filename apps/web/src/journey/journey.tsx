import { api } from "@q9chat/convex";
import { firstName, initials } from "@q9chat/domain";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

import type { GroupListRow, Me } from "../chat/types.js";
import { useSession } from "../lib/session.js";
import { AccountDialog } from "../screens/dialogs.js";
import { ChatShell, PickAGroup } from "../screens/shell.js";
import { NoGroupsYet, Sidebar } from "../screens/sidebar.js";
import { Toast } from "../ui/overlay.js";
import { AppRoot } from "../ui/root.js";
import { OAuthArrival } from "./oauth-arrival.js";
import { isPhotoRejection, photoSelectionError, uploadPhoto, usePhotos } from "./photos.js";
import { ProfileSetup } from "./setup.js";
import { SignInJourney } from "./sign-in.js";

const SignOutAction = createContext<(() => void) | null>(null);
function useSignOutAction() {
  const action = useContext(SignOutAction);
  if (!action) throw new Error("Sign out requires Journey");
  return action;
}

export function Journey({
  authError,
  oauthArrival,
}: {
  readonly authError: boolean;
  readonly oauthArrival: boolean;
}) {
  const session = useSession();
  const [now, setNow] = useState(Date.now);
  const [signOutStatus, setSignOutStatus] = useState<"idle" | "pending" | "complete" | "failed">(
    "idle",
  );
  const { signOut } = session;
  const leave = useCallback(() => {
    if (signOutStatus === "pending") return;
    setSignOutStatus("pending");
    void signOut().then(
      () => setSignOutStatus("complete"),
      () => setSignOutStatus("failed"),
    );
  }, [signOut, signOutStatus]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  return (
    <SignOutAction.Provider value={leave}>
      <AppRoot clock={{ now }}>
        {session.status === "loading" ? (
          <Loading />
        ) : session.user === null ? (
          <SignInJourney
            authError={authError}
            signOutStatus={signOutStatus}
            onRetrySignOut={leave}
            onSignInAttempt={() => setSignOutStatus("idle")}
          />
        ) : (
          <ProfileGate key={session.user.id} />
        )}
        {session.user ? <OAuthArrival method={session.method} arrival={oauthArrival} /> : null}
      </AppRoot>
    </SignOutAction.Provider>
  );
}

function Loading() {
  return <output className="center">Loading…</output>;
}

function AccountUnavailable() {
  const signOut = useSignOutAction();
  return (
    <div className="center">
      <p>We couldn't open your account. Please sign in again.</p>
      <button type="button" onClick={signOut}>
        Sign out
      </button>
    </div>
  );
}

type ProfileResult = NonNullable<FunctionReturnType<typeof api.profiles.me>>;
type ReadyProfile = Extract<ProfileResult, { status: "ready" }>["profile"];
type SessionUser = NonNullable<ReturnType<typeof useSession>["user"]>;

function ProfileGate() {
  const { user } = useSession();
  const { isAuthenticated, isLoading } = useConvexAuth();
  if (!user || isLoading) return <Loading />;
  if (!isAuthenticated) return <AccountUnavailable />;
  return <ProfileState user={user} />;
}

function ProfileState({ user }: { readonly user: SessionUser }) {
  const me = useQuery(api.profiles.me, {});
  if (me === undefined) return <Loading />;
  if (me === null || me.status === "unavailable") return <AccountUnavailable />;
  return <CompleteProfile user={user} me={me} />;
}

function CompleteProfile({
  user,
  me,
}: {
  readonly user: SessionUser;
  readonly me: Exclude<ProfileResult, { status: "unavailable" }>;
}) {
  const [setup, setSetup] = useState<"idle" | "submitting" | "complete">("idle");
  if (me.status === "needsSetup" || setup === "submitting")
    return (
      <ProfileSetup
        user={user}
        onStarted={() => setSetup("submitting")}
        onFinished={() => setSetup("complete")}
      />
    );
  return <Groups profile={me.profile} welcome={setup === "complete"} />;
}

type LiveGroup = FunctionReturnType<typeof api.groups.list>[number];
function groupRow(row: LiveGroup, photos: ReadonlyMap<string, string>): GroupListRow {
  const avatar = {
    initials: row.avatar.initials,
    color: row.kind === "group" ? null : row.avatar.color,
    photoUrl: row.avatar.photo ? (photos.get(row.avatar.photo) ?? null) : null,
  };
  return row.status === "removed"
    ? { ...row, avatar, removedBy: row.removedBy.name }
    : { ...row, avatar };
}

function accountProvider(method: ReturnType<typeof useSession>["method"]): Me["provider"] {
  if (method === "google") return "Google";
  if (method === "apple") return "Apple";
  return "Email code";
}

function photoPaths(profile: ReadyProfile, groups: readonly LiveGroup[]) {
  return [profile.photo, ...groups.map((row) => row.avatar.photo)].filter((path) => path !== null);
}

function Groups({
  profile,
  welcome,
}: {
  readonly profile: ReadyProfile;
  readonly welcome: boolean;
}) {
  const { method } = useSession();
  const groups = useQuery(api.groups.list, {});
  const [accountOpen, setAccountOpen] = useState(false);
  const [notice, setNotice] = useState(welcome ? `Welcome, ${firstName(profile.displayName)}` : "");
  const { photos, refresh: refreshPhotos } = usePhotos(
    photoPaths(profile, groups ?? []),
    setNotice,
  );
  const me: Me = {
    displayName: profile.displayName,
    email: profile.email,
    provider: accountProvider(method),
    avatar: {
      initials: initials(profile.displayName),
      color: profile.color,
      photoUrl: photoUrl(profile.photo, photos),
    },
  };
  const rows = (groups ?? []).map((row) => groupRow(row, photos));
  const unavailable = () => setNotice("This is coming in the next journey.");

  return (
    <>
      <ChatShell
        sidebar={
          <Sidebar
            me={me}
            rows={rows}
            selectedGroupId={null}
            onSelect={unavailable}
            onNewGroup={unavailable}
            onSearch={unavailable}
            onAccount={() => setAccountOpen(true)}
          />
        }
        main={<GroupsContent groups={groups} onNewGroup={unavailable} />}
        onOpenSearch={unavailable}
      />
      {accountOpen ? (
        <Account
          me={me}
          onClose={() => setAccountOpen(false)}
          onNotice={setNotice}
          onPhotoChange={refreshPhotos}
        />
      ) : null}
      {notice ? <Toast message={notice} /> : null}
    </>
  );
}

function photoUrl(path: string | null, photos: ReadonlyMap<string, string>) {
  return path ? (photos.get(path) ?? null) : null;
}

function Account({
  me,
  onClose,
  onNotice,
  onPhotoChange,
}: {
  readonly me: Me;
  readonly onClose: () => void;
  readonly onNotice: (message: string) => void;
  readonly onPhotoChange: () => void;
}) {
  const { fetchAccessToken } = useSession();
  const signOut = useSignOutAction();
  const update = useMutation(api.profiles.update);
  const [name, setName] = useState(me.displayName);
  const busy = useRef(false);
  const picker = useRef<HTMLInputElement>(null);
  async function changePhoto(file: File | null) {
    if (busy.current) return;
    const selectionError = file ? photoSelectionError(file) : null;
    if (selectionError) {
      onNotice(selectionError);
      return;
    }
    busy.current = true;
    try {
      await update({
        photoUploadId: file
          ? await uploadPhoto(file, await fetchAccessToken({ forceRefreshToken: false }))
          : null,
      });
      onPhotoChange();
      onNotice("");
    } catch (error) {
      onNotice(
        isPhotoRejection(error)
          ? "Couldn't use that photo. Choose another one."
          : "Couldn't update your photo. Try again.",
      );
    } finally {
      busy.current = false;
    }
  }
  async function closeAccount() {
    if (busy.current) return;
    busy.current = true;
    try {
      if (name.trim() !== me.displayName) await update({ displayName: name.trim() });
      onClose();
      onNotice("");
    } catch {
      onNotice("Enter a name of 1 to 60 characters.");
    } finally {
      busy.current = false;
    }
  }

  return (
    <>
      <input
        ref={picker}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        hidden
        aria-label="Account photo"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void changePhoto(file);
          event.target.value = "";
        }}
      />
      <AccountDialog
        me={me}
        name={name}
        onNameChange={setName}
        onUploadPhoto={() => picker.current?.click()}
        onRemovePhoto={() => void changePhoto(null)}
        onDeleteAccount={() => onNotice("This is coming in the next journey.")}
        onSignOut={signOut}
        onClose={() => void closeAccount()}
      />
    </>
  );
}

function GroupsContent({
  groups,
  onNewGroup,
}: {
  readonly groups: readonly LiveGroup[] | undefined;
  readonly onNewGroup: () => void;
}) {
  if (groups === undefined) return <Loading />;
  if (groups.length === 0) return <NoGroupsYet onNewGroup={onNewGroup} />;
  return <PickAGroup />;
}
