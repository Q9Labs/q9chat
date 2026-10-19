import { api, type Id } from "@q9chat/convex";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useConvex, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Component, useEffect, useRef, useState, useTransition, type ReactNode } from "react";

import { ChatHeader } from "../chat/chat-view.js";
import type { Avatar as AvatarView, GroupDetail, PersonMatch } from "../chat/types.js";
import { NewGroupDialog } from "../screens/dialogs.js";
import { GroupInfo } from "../screens/group-info.js";
import { Button } from "../ui/controls.js";
import { invalidInviteCopy, journeyError, removedInviteCopy } from "./group-errors.js";
import { History } from "./history.js";
import { clearSavedJoin } from "./oauth.js";
import { usePhotos } from "./photos.js";
import { pickerLimit } from "./picker-limit.js";

type Person = FunctionReturnType<typeof api.people.find>[number];
type Detail = FunctionReturnType<typeof api.groups.get>;
type ActiveGroup = Extract<Detail, { status: "member" }>;

export class GroupJourneyBoundary extends Component<
  { readonly children: ReactNode },
  { readonly error: string | null }
> {
  override state: { readonly error: string | null } = { error: null };
  static getDerivedStateFromError(error: unknown) {
    return { error: journeyError(error) };
  }
  override render() {
    return this.state.error ? (
      <div className="center">
        <p role="alert">{this.state.error}</p>
        <a href="/">Back to your groups</a>
      </div>
    ) : (
      this.props.children
    );
  }
}

function inviteToken() {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let token = "";
  while (token.length < 16) {
    for (const byte of crypto.getRandomValues(new Uint8Array(24))) {
      if (byte < 248 && token.length < 16) token += alphabet[byte % 62];
    }
  }
  return token;
}

function inviteUrl(token: string) {
  return `${window.location.origin}/join/${token}`;
}

function avatar(
  person: { avatar: { photo: string | null; color: string; initials: string } },
  photos: ReadonlyMap<string, string>,
): AvatarView {
  return {
    ...person.avatar,
    photoUrl: person.avatar.photo ? (photos.get(person.avatar.photo) ?? null) : null,
  };
}

function displayGroup(detail: ActiveGroup, photos: ReadonlyMap<string, string>): GroupDetail {
  const { partner, inviteToken: token, ...group } = detail;
  return {
    ...group,
    avatar: {
      ...avatar(detail, photos),
      color: detail.kind === "group" ? null : detail.avatar.color,
    },
    members: detail.members.map((p) => ({ ...p, avatar: avatar(p, photos) })),
    ...(partner ? { partner: { ...partner, avatar: avatar(partner, photos) } } : {}),
    ...(token ? { inviteToken: token } : {}),
  };
}

type PickerMode = { kind: "new" } | { kind: "add"; group: ActiveGroup };
function usePeopleMatches(query: string) {
  const [debounced, setDebounced] = useState(query);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query), 200);
    return () => window.clearTimeout(timer);
  }, [query]);
  const trimmed = debounced.trim();
  const tooLong = query.trim().length > 100;
  const matches = useQuery(
    api.people.find,
    trimmed && trimmed.length <= 100 ? { query: trimmed } : "skip",
  );
  return { matches: query === debounced ? matches : undefined, tooLong };
}
function pairCandidate(mode: PickerMode, name: string, people: readonly Person[]) {
  if (mode.kind !== "new" || name.trim() !== "") return null;
  return people.length === 1 ? (people[0]?.id ?? null) : null;
}
function usePairMatch(
  mode: PickerMode,
  name: string,
  people: readonly Person[],
  onNotice: (text: string) => void,
) {
  const client = useConvex();
  const profileId = pairCandidate(mode, name, people);
  const [match, setMatch] = useState<{ profileId: Id<"profiles">; groupId: Id<"groups"> | null }>();
  useEffect(() => {
    let cancelled = false;
    if (profileId)
      void client.query(api.groups.pairWith, { profileId }).then(
        (groupId) => {
          if (!cancelled) setMatch({ profileId, groupId });
        },
        (error: unknown) => {
          if (!cancelled) onNotice(journeyError(error, 1));
        },
      );
    return () => {
      cancelled = true;
    };
  }, [client, profileId, onNotice]);
  return match?.profileId === profileId ? match.groupId : undefined;
}
function availablePeople(
  matches: readonly Person[],
  selected: readonly Person[],
  mode: PickerMode,
) {
  const excluded = new Set(selected.map((p) => p.id));
  if (mode.kind === "add") for (const member of mode.group.members) excluded.add(member.id);
  return matches.filter((p) => !excluded.has(p.id));
}
function unknownAddress(query: string, matches: readonly Person[] | undefined) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(query.trim()) && matches?.length === 0
    ? query.trim()
    : null;
}
function usePickerHint(query: string, matches: readonly Person[] | undefined) {
  const me = useQuery(api.profiles.me, {});
  const ownEmail =
    me?.status === "ready" && query.trim().toLowerCase() === me.profile.email.toLowerCase();
  return {
    unknownEmail: ownEmail ? null : unknownAddress(query, matches),
    pickerHint: ownEmail ? "That's you." : undefined,
  };
}
function useGroupCreation() {
  const create = useMutation(api.groups.create);
  const openPair = useMutation(api.groups.openPair);
  return async (name: string, people: readonly Person[], token: string) => {
    const only = people.length === 1 ? people[0] : undefined;
    if (only && !name.trim()) return openPair({ profileId: only.id });
    return create({
      ...(name.trim() ? { name: name.trim() } : {}),
      memberIds: people.map((p) => p.id),
      inviteToken: token,
    });
  };
}
function usePickerSubmit({
  mode,
  name,
  people,
  token,
  onOpen,
  onClose,
  onNotice,
}: {
  readonly mode: PickerMode;
  readonly name: string;
  readonly people: readonly Person[];
  readonly token: string;
  readonly onOpen: (id: Id<"groups">) => void;
  readonly onClose: () => void;
  readonly onNotice: (text: string) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const busy = useRef(false);
  const createGroup = useGroupCreation();
  const add = useMutation(api.groups.addMembers);
  function submit() {
    if (busy.current) return;
    const limit = pickerLimit(mode.kind, people.length);
    if (limit) {
      setError(limit);
      return;
    }
    busy.current = true;
    setError("");
    startTransition(async () => {
      try {
        if (mode.kind === "add") {
          await add({ groupId: mode.group.groupId, profileIds: people.map((p) => p.id) });
          onNotice(`Added ${people.map((p) => p.name).join(", ")}`);
        } else {
          const id = await createGroup(name, people, token);
          onOpen(id);
        }
        onClose();
      } catch (cause) {
        setError(journeyError(cause, people.length));
      } finally {
        busy.current = false;
      }
    });
  }
  return { pending, error, setError, submit };
}
function PeopleDialog({
  mode,
  onClose,
  onOpen,
  onNotice,
}: {
  readonly mode: PickerMode;
  readonly onClose: () => void;
  readonly onOpen: (id: Id<"groups">) => void;
  readonly onNotice: (text: string) => void;
}) {
  const [name, setName] = useState("");
  const [query, setQuery] = useState("");
  const [people, setPeople] = useState<Person[]>([]);
  const [token] = useState(() =>
    mode.kind === "add" ? (mode.group.inviteToken ?? "") : inviteToken(),
  );
  const [copied, setCopied] = useState(false);
  const { matches, tooLong: queryTooLong } = usePeopleMatches(query);
  const pair = usePairMatch(mode, name, people, onNotice);
  const { photos } = usePhotos(
    [...people, ...(matches ?? [])].flatMap((p) => (p.avatar.photo ? [p.avatar.photo] : [])),
    onNotice,
  );
  const display = (p: Person): PersonMatch => ({ ...p, isYou: false, avatar: avatar(p, photos) });
  const suggestions = availablePeople(matches ?? [], people, mode);
  const { unknownEmail, pickerHint } = usePickerHint(query, matches);
  const { pending, error, setError, submit } = usePickerSubmit({
    mode,
    name,
    people,
    token,
    onOpen,
    onClose,
    onNotice,
  });
  async function copy() {
    try {
      await navigator.clipboard.writeText(inviteUrl(token));
      setCopied(true);
      onNotice("Invite link copied");
    } catch {
      setError("Couldn't copy the link. Select and copy it instead.");
    }
  }
  return (
    <NewGroupDialog
      mode={mode.kind}
      groupTitle={mode.kind === "add" ? mode.group.title : ""}
      name={name}
      onNameChange={setName}
      people={people.map(display)}
      onRemovePerson={(p) => setPeople(people.filter((selected) => selected.id !== p.id))}
      query={query}
      queryError={queryTooLong ? "Use 100 characters or fewer to find someone." : undefined}
      pickerHint={pickerHint}
      onQueryChange={setQuery}
      suggestions={suggestions.map(display)}
      onPick={(person) => {
        const limit = pickerLimit(mode.kind, people.length + 1);
        if (limit) {
          setError(limit);
          return;
        }
        setError("");
        const match = matches?.find((p) => p.id === person.id);
        if (match) {
          setPeople([...people, match]);
          setQuery("");
        }
      }}
      unknownEmail={unknownEmail}
      pairExists={pair !== null && pair !== undefined}
      inviteToken={token}
      inviteUrl={inviteUrl(token)}
      linkCopied={copied}
      onCopyLink={() => void copy()}
      onSubmit={submit}
      onClose={onClose}
      pending={pending}
      error={error}
    />
  );
}

function Join({
  token,
  info,
  onOpen,
}: {
  readonly token: string;
  readonly info: FunctionReturnType<typeof api.groups.inviteInfo> | undefined;
  readonly onOpen: (id: Id<"groups">) => void;
}) {
  const join = useMutation(api.groups.join);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const busy = useRef(false);
  function accept() {
    if (busy.current) return;
    busy.current = true;
    setError("");
    startTransition(async () => {
      try {
        const groupId = await join({ token });
        clearSavedJoin();
        onOpen(groupId);
      } catch (cause) {
        setError(journeyError(cause));
      } finally {
        busy.current = false;
      }
    });
  }
  return <InviteState info={info} error={error} pending={pending} onJoin={accept} />;
}
function InviteState({
  info,
  error,
  pending,
  onJoin,
}: {
  readonly info: FunctionReturnType<typeof api.groups.inviteInfo> | undefined;
  readonly error: string;
  readonly pending: boolean;
  readonly onJoin: () => void;
}) {
  if (info === undefined) return <output className="center">Loading…</output>;
  if (info === null)
    return (
      <div className="center">
        <p>{invalidInviteCopy}</p>
      </div>
    );
  if (info.status === "removed")
    return (
      <div className="center">
        <p>{removedInviteCopy}</p>
      </div>
    );
  if (info.status === "member") return null;
  return (
    <div className="center">
      <h2>Join {info.title}</h2>
      <p>{info.memberCount} members</p>
      <p>Join to read and write in this group.</p>
      <Button variant="solid" disabled={pending} onClick={onJoin}>
        Join group
      </Button>
      {error ? <p role="alert">{error}</p> : null}
    </div>
  );
}

function useInvite(token: string | undefined) {
  const valid = token !== undefined && /^[A-Za-z0-9]{16,32}$/u.test(token);
  const info = useQuery(api.groups.inviteInfo, valid ? { token } : "skip");
  useEffect(() => {
    if (!valid || info === null || info?.status === "member" || info?.status === "removed")
      clearSavedJoin();
  }, [valid, info]);
  return { info: valid ? info : null, groupId: info?.status === "member" ? info.groupId : null };
}
function groupPhotoPaths(detail: Detail | undefined) {
  if (!detail) return [];
  const paths = [detail.avatar.photo];
  if (detail.status === "member") paths.push(...detail.members.map((p) => p.avatar.photo));
  return paths.filter((path) => path !== null);
}
function useInviteCopy(detail: Detail | undefined, onNotice: (text: string) => void) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    if (detail?.status !== "member" || !detail.inviteToken) return;
    try {
      await navigator.clipboard.writeText(inviteUrl(detail.inviteToken));
      setCopied(true);
      onNotice("Invite link copied");
    } catch {
      onNotice("Couldn't copy the link. Select and copy it instead.");
    }
  }
  return { copied, copy, reset: () => setCopied(false) };
}
function LiveGroupInfo({
  group,
  detail,
  onClose,
  onAdd,
  onCopy,
  copied,
  onMessage,
  unavailable,
}: {
  readonly group: GroupDetail | null;
  readonly detail: Detail | undefined;
  readonly onClose: () => void;
  readonly onAdd: (group: ActiveGroup) => void;
  readonly onCopy: () => void;
  readonly copied: boolean;
  readonly onMessage: (id: Id<"profiles">) => void;
  readonly unavailable: () => void;
}) {
  if (!group || detail?.status !== "member") return null;
  return (
    <GroupInfo
      group={group}
      onClose={onClose}
      onAddPeople={() => onAdd(detail)}
      inviteUrl={inviteUrl(detail.inviteToken ?? "")}
      onCopyLink={onCopy}
      linkCopied={copied}
      onSearch={unavailable}
      notificationsOpen={false}
      onNotificationsOpenChange={unavailable}
      onNotifyChange={unavailable}
      onMessageMember={(member) => {
        const person = detail.members.find((p) => p.id === member.id);
        if (person) onMessage(person.id);
      }}
      onRemoveMember={unavailable}
      onLeave={unavailable}
    />
  );
}

function useInfoState(detail: Detail | undefined) {
  const [open, setOpen] = useState(false);
  if (detail?.status === "removed" && open) setOpen(false);
  return { infoOpen: open && detail?.status === "member", setInfoOpen: setOpen };
}

function activeDisplay(detail: Detail | undefined, photos: ReadonlyMap<string, string>) {
  return detail?.status === "member" ? displayGroup(detail, photos) : null;
}

export function useGroupJourney({
  covered,
  token,
  selectedGroup,
  renderEmpty,
  onSearchGroup,
  onNotice,
}: {
  readonly covered: boolean;
  readonly token: string | undefined;
  readonly selectedGroup: Id<"groups"> | null;
  readonly renderEmpty: (onNewGroup: () => void) => ReactNode;
  readonly onSearchGroup: (id: Id<"groups">) => void;
  readonly onNotice: (text: string) => void;
}) {
  const navigate = useNavigate();
  const invite = useInvite(token);
  const selected = selectedGroup ?? invite.groupId;
  const [picker, setPicker] = useState<PickerMode | null>(null);
  const detail = useQuery(api.groups.get, selected ? { groupId: selected } : "skip");
  const { infoOpen, setInfoOpen } = useInfoState(detail);
  const openPair = useMutation(api.groups.openPair);
  const { photos } = usePhotos(groupPhotoPaths(detail), onNotice);
  const { copied, copy, reset } = useInviteCopy(detail, onNotice);
  const unavailable = () => onNotice("This is coming in the next journey.");
  function open(id: Id<"groups">) {
    void navigate({ to: "/", search: { group: id, authError: undefined, message: undefined } });
    setInfoOpen(false);
    reset();
  }
  async function message(id: Id<"profiles">) {
    try {
      open(await openPair({ profileId: id }));
    } catch (error) {
      onNotice(journeyError(error, 1));
    }
  }
  const group = activeDisplay(detail, photos);
  return {
    selected,
    open,
    newGroup: () => setPicker({ kind: "new" }),
    main: (
      <GroupWorkspace
        covered={covered || picker !== null}
        empty={renderEmpty(() => setPicker({ kind: "new" }))}
        token={token}
        selected={selected}
        detail={detail}
        invite={invite.info}
        onOpen={open}
        onInfo={() => setInfoOpen(true)}
        onMessage={(id) => void message(id)}
        photos={photos}
        onSearchGroup={onSearchGroup}
      />
    ),
    info: infoOpen ? (
      <LiveGroupInfo
        group={group}
        detail={detail}
        onClose={() => setInfoOpen(false)}
        onAdd={(current) => setPicker({ kind: "add", group: current })}
        onCopy={() => void copy()}
        copied={copied}
        onMessage={(id) => void message(id)}
        unavailable={unavailable}
      />
    ) : undefined,
    dialog: picker ? (
      <PeopleDialog
        mode={picker}
        onClose={() => setPicker(null)}
        onOpen={open}
        onNotice={onNotice}
      />
    ) : null,
  };
}

function GroupWorkspace({
  covered,
  empty,
  token,
  selected,
  detail,
  invite,
  onOpen,
  onInfo,
  onMessage,
  photos,
  onSearchGroup,
}: {
  readonly covered: boolean;
  readonly empty: ReactNode;
  readonly token: string | undefined;
  readonly selected: Id<"groups"> | null;
  readonly detail: Detail | undefined;
  readonly invite: FunctionReturnType<typeof api.groups.inviteInfo> | undefined;
  readonly onOpen: (id: Id<"groups">) => void;
  readonly onInfo: () => void;
  readonly onMessage: (id: Id<"profiles">) => void;
  readonly photos: ReadonlyMap<string, string>;
  readonly onSearchGroup: (id: Id<"groups">) => void;
}) {
  const routeSearch = useSearch({ strict: false });
  if (selected === null)
    return token ? <Join token={token} info={invite} onOpen={onOpen} /> : empty;
  if (detail === undefined) return <output className="center">Loading…</output>;
  return (
    <LoadedGroup
      targetSequence={routeSearch.message}
      covered={covered}
      detail={detail}
      photos={photos}
      onInfo={onInfo}
      onMessage={onMessage}
      onSearchGroup={onSearchGroup}
    />
  );
}
function LoadedGroup({
  targetSequence,
  covered,
  detail,
  photos,
  onInfo,
  onMessage,
  onSearchGroup,
}: {
  readonly targetSequence: number | undefined;
  readonly covered: boolean;
  readonly detail: Detail;
  readonly photos: ReadonlyMap<string, string>;
  readonly onInfo: () => void;
  readonly onMessage: (id: Id<"profiles">) => void;
  readonly onSearchGroup: (id: Id<"groups">) => void;
}) {
  if (detail?.status !== "member")
    return (
      <p className="center">
        {detail?.status === "removed"
          ? removedInviteCopy
          : "You no longer have access to this group."}
      </p>
    );
  const group = displayGroup(detail, photos);
  return (
    <>
      <ChatHeader
        group={group}
        onOpenInfo={onInfo}
        onSearchGroup={() => onSearchGroup(detail.groupId)}
      />
      <History
        key={`${detail.groupId}-${targetSequence ?? "latest"}`}
        targetSequence={targetSequence}
        group={detail}
        covered={covered}
        onMessage={onMessage}
      />
    </>
  );
}
