import { api, type Id } from "@q9chat/convex";
import { eventSentence } from "@q9chat/domain";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { ConvexError } from "convex/values";
import { Component, useLayoutEffect, useRef, useState, useTransition, type ReactNode } from "react";

import { ChatHeader } from "../chat/chat-view.js";
import type { Avatar as AvatarView, GroupDetail, PersonMatch } from "../chat/types.js";
import { NewGroupDialog } from "../screens/dialogs.js";
import { GroupInfo } from "../screens/group-info.js";
import { Avatar } from "../ui/avatar.js";
import { Button } from "../ui/controls.js";
import { Dialog, DialogActions } from "../ui/overlay.js";
import { usePhotos } from "./photos.js";

type Person = FunctionReturnType<typeof api.people.find>[number];
type Detail = FunctionReturnType<typeof api.groups.get>;
type ActiveGroup = Extract<Detail, { status: "member" }>;
const removedInviteCopy = "You were removed from this group. Ask a member to add you back.";
const invalidInviteCopy = "This invite link isn't valid.";

const errorCopy = new Map([
  ["name_required", "Enter a group name or add someone."],
  ["name_too_long", "Use a group name of 80 characters or fewer."],
  ["group_full", "This group is full. A group can have up to 100 people."],
  [
    "too_many_groups",
    "Someone has reached the 100-group limit. Leave a group before trying again.",
  ],
  ["pair_locked", "You can't add people to a group of two. Create a new group instead."],
  ["invite_invalid", invalidInviteCopy],
  ["removed_from_group", removedInviteCopy],
  ["not_member", "You no longer have access to this group."],
  ["account_unavailable", "This account isn't available. Try signing in again."],
]);
function journeyError(error: unknown): string {
  const fallback = "Couldn't complete that. Try again.";
  if (!(error instanceof ConvexError)) return fallback;
  const data: unknown = error.data;
  if (typeof data !== "object" || data === null || !("code" in data)) return fallback;
  return typeof data.code === "string" ? (errorCopy.get(data.code) ?? fallback) : fallback;
}

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
  const trimmed = query.trim();
  const tooLong = trimmed.length > 100;
  const matches = useQuery(api.people.find, trimmed && !tooLong ? { query: trimmed } : "skip");
  return { matches, tooLong };
}
function usePairMatch(mode: PickerMode, name: string, people: readonly Person[]) {
  const only = people.length === 1 ? people[0] : undefined;
  return useQuery(
    api.groups.pairWith,
    mode.kind === "new" && !name.trim() && only ? { profileId: only.id } : "skip",
  );
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
        setError(journeyError(cause));
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
  const pair = usePairMatch(mode, name, people);
  const { photos } = usePhotos(
    [...people, ...(matches ?? [])].flatMap((p) => (p.avatar.photo ? [p.avatar.photo] : [])),
    onNotice,
  );
  const display = (p: Person): PersonMatch => ({ ...p, isYou: false, avatar: avatar(p, photos) });
  const suggestions = availablePeople(matches ?? [], people, mode);
  const unknownEmail = unknownAddress(query, matches);
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
      onQueryChange={setQuery}
      suggestions={suggestions.map(display)}
      onPick={(person) => {
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
        onOpen(await join({ token }));
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

function History({
  group,
  onMessage,
  photos,
}: {
  readonly group: ActiveGroup;
  readonly onMessage: (id: Id<"profiles">) => void;
  readonly photos: ReadonlyMap<string, string>;
}) {
  const messages = useQuery(
    api.messages.range,
    group.lastSequence > 0
      ? {
          groupId: group.groupId,
          fromSequence: Math.max(1, group.lastSequence - 99),
          toSequence: group.lastSequence,
        }
      : "skip",
  );
  const [author, setAuthor] = useState<ActiveGroup["members"][number] | null>(null);
  const log = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (messages && log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [messages]);
  return (
    <>
      <div ref={log} className="tl" role="log" aria-label="Messages">
        {group.kind === "pair" ? (
          <div className="sys">
            This is the start of your group with <b>{group.partner?.name}</b>
          </div>
        ) : null}
        {(messages ?? []).map((message) =>
          message.kind === "event" ? (
            <div className="sys" key={message.id}>
              {message.event.type === "joined"
                ? `${message.event.person.name} joined`
                : eventSentence(message.event)}
            </div>
          ) : (
            <div className="mrow" key={message.id}>
              <button
                type="button"
                className="member-button"
                aria-label={`About ${message.author.name}`}
                onClick={() => setAuthor(message.author)}
              >
                <Avatar avatar={avatar(message.author, photos)} size="sm" />
                {message.author.name}
              </button>
              <p>{message.kind === "deleted" ? "This message was deleted" : message.body}</p>
            </div>
          ),
        )}
      </div>
      <div className="composer">
        <div className="field">
          <textarea aria-label="Message" rows={1} placeholder={`Message ${group.title}`} disabled />
        </div>
      </div>
      {author ? (
        <Dialog label={author.fullName} onClose={() => setAuthor(null)}>
          <h3>{author.fullName}</h3>
          <DialogActions>
            <Button onClick={() => setAuthor(null)}>Close</Button>
            {author.isYou ? null : (
              <Button
                variant="solid"
                onClick={() => {
                  onMessage(author.id);
                  setAuthor(null);
                }}
              >
                Message
              </Button>
            )}
          </DialogActions>
        </Dialog>
      ) : null}
    </>
  );
}

function useInvite(token: string | undefined) {
  const valid = token !== undefined && /^[A-Za-z0-9]{16,32}$/u.test(token);
  const info = useQuery(api.groups.inviteInfo, valid ? { token } : "skip");
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
  visible,
  group,
  detail,
  onClose,
  onAdd,
  onCopy,
  copied,
  onMessage,
  unavailable,
}: {
  readonly visible: boolean;
  readonly group: GroupDetail | null;
  readonly detail: Detail | undefined;
  readonly onClose: () => void;
  readonly onAdd: (group: ActiveGroup) => void;
  readonly onCopy: () => void;
  readonly copied: boolean;
  readonly onMessage: (id: Id<"profiles">) => void;
  readonly unavailable: () => void;
}) {
  if (!visible || !group || detail?.status !== "member") return null;
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

export function useGroupJourney({
  token,
  renderEmpty,
  onNotice,
}: {
  readonly token: string | undefined;
  readonly renderEmpty: (onNewGroup: () => void) => ReactNode;
  readonly onNotice: (text: string) => void;
}) {
  const [chosen, setSelected] = useState<Id<"groups"> | null>(null);
  const invite = useInvite(token);
  const selected = chosen ?? invite.groupId;
  const [infoOpen, setInfoOpen] = useState(false);
  const [picker, setPicker] = useState<PickerMode | null>(null);
  const detail = useQuery(api.groups.get, selected ? { groupId: selected } : "skip");
  const openPair = useMutation(api.groups.openPair);
  const { photos } = usePhotos(groupPhotoPaths(detail), onNotice);
  const { copied, copy, reset } = useInviteCopy(detail, onNotice);
  const unavailable = () => onNotice("This is coming in the next journey.");
  function open(id: Id<"groups">) {
    setSelected(id);
    setInfoOpen(false);
    reset();
  }
  async function message(id: Id<"profiles">) {
    try {
      open(await openPair({ profileId: id }));
    } catch (error) {
      onNotice(journeyError(error));
    }
  }
  const group = detail?.status === "member" ? displayGroup(detail, photos) : null;
  return {
    selected,
    open,
    newGroup: () => setPicker({ kind: "new" }),
    main: (
      <GroupWorkspace
        empty={renderEmpty(() => setPicker({ kind: "new" }))}
        token={token}
        selected={selected}
        detail={detail}
        invite={invite.info}
        onOpen={open}
        onInfo={() => setInfoOpen(true)}
        onMessage={(id) => void message(id)}
        photos={photos}
        onUnavailable={unavailable}
      />
    ),
    info: (
      <LiveGroupInfo
        visible={infoOpen}
        group={group}
        detail={detail}
        onClose={() => setInfoOpen(false)}
        onAdd={(current) => setPicker({ kind: "add", group: current })}
        onCopy={() => void copy()}
        copied={copied}
        onMessage={(id) => void message(id)}
        unavailable={unavailable}
      />
    ),
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
  empty,
  token,
  selected,
  detail,
  invite,
  onOpen,
  onInfo,
  onMessage,
  photos,
  onUnavailable,
}: {
  readonly empty: ReactNode;
  readonly token: string | undefined;
  readonly selected: Id<"groups"> | null;
  readonly detail: Detail | undefined;
  readonly invite: FunctionReturnType<typeof api.groups.inviteInfo> | undefined;
  readonly onOpen: (id: Id<"groups">) => void;
  readonly onInfo: () => void;
  readonly onMessage: (id: Id<"profiles">) => void;
  readonly photos: ReadonlyMap<string, string>;
  readonly onUnavailable: () => void;
}) {
  if (selected === null)
    return token ? <Join token={token} info={invite} onOpen={onOpen} /> : empty;
  if (detail === undefined) return <output className="center">Loading…</output>;
  return (
    <LoadedGroup
      detail={detail}
      photos={photos}
      onInfo={onInfo}
      onMessage={onMessage}
      onUnavailable={onUnavailable}
    />
  );
}
function LoadedGroup({
  detail,
  photos,
  onInfo,
  onMessage,
  onUnavailable,
}: {
  readonly detail: Detail;
  readonly photos: ReadonlyMap<string, string>;
  readonly onInfo: () => void;
  readonly onMessage: (id: Id<"profiles">) => void;
  readonly onUnavailable: () => void;
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
      <ChatHeader group={group} onOpenInfo={onInfo} onSearchGroup={onUnavailable} />
      <History key={detail.groupId} group={detail} onMessage={onMessage} photos={photos} />
    </>
  );
}
