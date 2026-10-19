import { api } from "@q9chat/convex";
import { firstName, initials } from "@q9chat/domain";
import { useSearch } from "@tanstack/react-router";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Schema } from "effect";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

import type { GroupListRow, Me } from "../chat/types.js";
import { AccountTransport } from "../lib/account-transport.js";
import { useSession } from "../lib/session.js";
import { AccountDialog } from "../screens/dialogs.js";
import { ChatShell, PickAGroup } from "../screens/shell.js";
import { NoGroupsYet, Sidebar } from "../screens/sidebar.js";
import { Toast } from "../ui/overlay.js";
import { AppRoot } from "../ui/root.js";
import { GroupJourneyBoundary, useGroupJourney } from "./groups.js";
import { OAuthArrival } from "./oauth-arrival.js";
import { isPhotoRejection, photoSelectionError, uploadPhoto, usePhotos } from "./photos.js";
import { useSearchJourney } from "./search.js";
import { ProfileSetup } from "./setup.js";
import { SignInJourney } from "./sign-in.js";

const InviteToken = createContext<string | undefined>(undefined);

const SignOutAction = createContext<(() => void) | null>(null);
function useSignOutAction() {
  const action = useContext(SignOutAction);
  if (!action) throw new Error("Sign out requires Journey");
  return action;
}

function useJourneySignOut() {
  const [signOutStatus, setSignOutStatus] = useState<"idle" | "pending" | "complete" | "failed">(
    "idle",
  );
  const generation = useRef(0);
  const signOutSession = useRef<string | null>(null);
  const currentSession = useRef<string | null>(null);
  const { signOut, fetchAccessToken, user } = useSession();
  useEffect(() => {
    let active = true;
    if (user)
      void fetchAccessToken({ forceRefreshToken: false })
        .then((token) => {
          if (!active || !token) return;
          const payload = token.split(".")[1];
          if (!payload) return;
          const { sid } = Schema.decodeUnknownSync(
            Schema.parseJson(Schema.Struct({ sid: Schema.String })),
          )(atob(payload.replaceAll("-", "+").replaceAll("_", "/")));
          currentSession.current = sid;
          if (signOutSession.current !== null && signOutSession.current !== sid) {
            generation.current += 1;
            signOutSession.current = null;
            setSignOutStatus("idle");
          }
        })
        .catch(() => null);
    return () => {
      active = false;
    };
  }, [fetchAccessToken, user]);
  const leave = useCallback(() => {
    if (signOutStatus === "pending") return;
    const started = ++generation.current;
    signOutSession.current = currentSession.current;
    setSignOutStatus("pending");
    void signOut().then(
      () => {
        if (started === generation.current) setSignOutStatus("complete");
      },
      () => {
        if (started === generation.current) setSignOutStatus("failed");
      },
    );
  }, [signOut, signOutStatus]);
  return { signOutStatus, leave, clearSignOutStatus: () => setSignOutStatus("idle") };
}

export function Journey({
  authError,
  inviteToken,
}: {
  readonly authError: boolean;
  readonly inviteToken?: string;
}) {
  const session = useSession();
  const [now, setNow] = useState(Date.now);
  const { signOutStatus, leave, clearSignOutStatus } = useJourneySignOut();
  const arrivalMethod = authError ? null : session.method;
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
            onSignInAttempt={clearSignOutStatus}
          />
        ) : (
          <InviteToken.Provider value={inviteToken}>
            <AccountTransport key={session.user.id}>
              <ProfileGate />
            </AccountTransport>
          </InviteToken.Provider>
        )}
        {signOutStatus === "failed" ? (
          <Toast
            message="Couldn't sign out. Try again."
            action={{ label: "Try again", onClick: leave }}
          />
        ) : null}
        {session.status !== "loading" ? (
          <OAuthArrival key={arrivalMethod ?? "signed-out"} method={arrivalMethod} />
        ) : null}
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
  return (
    <GroupJourneyBoundary>
      <Groups profile={me.profile} welcome={setup === "complete"} />
    </GroupJourneyBoundary>
  );
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
    : {
        ...row,
        avatar,
        preview:
          row.kind === "pair" && row.preview.summary === ""
            ? { by: null, summary: `This is the start of your group with ${firstName(row.title)}` }
            : row.preview,
      };
}

function accountProvider(method: ReturnType<typeof useSession>["method"]): Me["provider"] {
  if (method === "google") return "Google";
  if (method === "apple") return "Apple";
  return "Email code";
}

function photoPaths(profile: ReadyProfile, groups: readonly LiveGroup[]) {
  return [profile.photo, ...groups.map((row) => row.avatar.photo)].filter((path) => path !== null);
}

function useSelectedGroup(groups: readonly LiveGroup[] | undefined) {
  const search = useSearch({ strict: false });
  return groups?.find((row) => row.groupId === search.group)?.groupId ?? null;
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
  const [notice, setNotice] = useState(() =>
    welcome ? `Welcome, ${firstName(profile.displayName)}` : "",
  );
  const { photos, refresh: refreshPhotos } = usePhotos(
    photoPaths(profile, groups ?? []),
    setNotice,
  );
  const search = useSearchJourney(groups, photos);
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
  const workspace = useGroupJourney({
    covered: accountOpen || search.isOpen,
    onSearchGroup: search.openGroup,
    selectedGroup: useSelectedGroup(groups),
    token: useContext(InviteToken),
    onNotice: setNotice,
    renderEmpty: (onNewGroup) => <GroupsContent groups={groups} onNewGroup={onNewGroup} />,
  });

  return (
    <>
      <ChatShell
        sidebar={
          <Sidebar
            me={me}
            rows={rows}
            selectedGroupId={workspace.selected}
            onSelect={(id) => {
              const row = groups?.find((group) => group.groupId === id);
              if (row) workspace.open(row.groupId);
            }}
            onNewGroup={workspace.newGroup}
            onSearch={search.openAll}
            onAccount={() => setAccountOpen(true)}
          />
        }
        main={workspace.main}
        info={workspace.info}
        onOpenSearch={search.openAll}
      />
      {search.dialog}
      {workspace.dialog}
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
