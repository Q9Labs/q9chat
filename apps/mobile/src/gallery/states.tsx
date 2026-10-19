import type { ReactElement } from "react";
import { Image } from "react-native";

import {
  ME,
  ME_FULL_NAME,
  avatarOf,
  defaultWorld,
  chatStateOf,
  groupAvatar,
  groupById,
  infoOf,
  personOf,
  rowsOf,
  searchOf,
  waveSamples,
  type FixtureMessage,
  type World,
} from "../fixtures/build";
import photoAsset from "../fixtures/photo.png";
import { noop } from "../kit/noop";
import { AccountScreen } from "../screens/AccountScreen";
import {
  CodeScreen,
  OfflineRestoreScreen,
  ProfileScreen,
  SignInScreen,
} from "../screens/AuthScreens";
import { ChatScreen, type ChatScreenProps } from "../screens/ChatScreen";
import { GroupsScreen } from "../screens/GroupsScreen";
import { InfoScreen, type InfoScreenProps } from "../screens/InfoScreen";
import { NewGroupScreen, type NewGroupScreenProps } from "../screens/NewGroupScreen";
import { SearchScreen } from "../screens/SearchScreen";
import {
  accountHandlers,
  chatHandlers,
  groupsHandlers,
  infoHandlers,
  newGroupHandlers,
  searchHandlers,
} from "./defaults";

export type GalleryState = { id: string; title: string; group: string; render: () => ReactElement };

const photoUri = Image.resolveAssetSource(photoAsset)?.uri ?? null;

const longWorld = (): World => ({ ...defaultWorld(), long: true });
const worldWith = (extra: Partial<World>): World => ({ ...defaultWorld(), ...extra });
const mine = (
  id: string,
  time: string,
  text: string,
  extra: Partial<FixtureMessage> = {},
): FixtureMessage => ({
  id,
  by: ME,
  day: "Today",
  time,
  text,
  kind: "text",
  ...extra,
});

type ChatOptions = { world?: World; unread?: number; typing?: number };

function chat(
  groupId: string,
  over: Partial<ChatScreenProps> = {},
  options: ChatOptions = {},
): ReactElement {
  const world = options.world ?? defaultWorld();
  const group = groupById(groupId);
  const props: ChatScreenProps = {
    ...chatHandlers,
    ...chatStateOf(groupId, world, options.unread ?? group.unread, options.typing ?? 1),
    tappedMessageId: null,
    playingMessageId: null,
    playProgress: 0,
    poppedReaction: null,
    composer: { kind: "compose" },
    draft: "",
    sheet: null,
    toast: null,
    ...over,
  };
  return <ChatScreen {...props} />;
}

function info(
  groupId: string,
  over: Partial<InfoScreenProps> = {},
  world: World = defaultWorld(),
): ReactElement {
  const props: InfoScreenProps = {
    ...infoHandlers,
    info: { status: "member", ...infoOf(groupId, world) },
    sheet: null,
    copied: false,
    toast: null,
    ...over,
  };
  return <InfoScreen {...props} />;
}

function newGroup(over: Partial<NewGroupScreenProps>): ReactElement {
  const props: NewGroupScreenProps = {
    ...newGroupHandlers,
    mode: "create",
    groupName: "",
    people: [],
    query: "",
    suggestions: [],
    hint: { kind: "explain" },
    inviteLink: "chat.q9labs.ai/join/b7Tx4k",
    copied: false,
    primaryLabel: "Create",
    primaryEnabled: false,
    ...over,
  };
  return <NewGroupScreen {...props} />;
}

const w = defaultWorld();
const people = (...ids: string[]) => ids.map((id) => personOf(id, w));

function groupsScreen(
  over: { world?: World; offline?: boolean; toast?: string | null; removed?: boolean } = {},
): ReactElement {
  const world = over.world ?? w;
  return (
    <GroupsScreen
      {...groupsHandlers}
      me={avatarOf(ME)}
      rows={rowsOf(world, {
        unreadOn: !over.removed,
        removedGroupIds: over.removed ? ["launch"] : [],
        removedBy: "shoaib",
      })}
      offline={over.offline ?? false}
      showPermissionBanner={false}
      toast={over.toast ?? null}
    />
  );
}

const failedWorld = () =>
  worldWith({
    append: {
      launch: [mine("f1", "10:45", "Trying sign in with Apple now.", { state: "failed" })],
    },
  });
const queuedWorld = () =>
  worldWith({
    append: { launch: [mine("q1", "10:45", "On my way to the office.", { state: "queued" })] },
  });
const sendingWorld = () =>
  worldWith({
    append: { launch: [mine("n1", "10:45", "Sending the screenshots now.", { state: "sending" })] },
  });
const eventsWorld = () =>
  worldWith({
    append: {
      launch: [
        {
          id: "y1",
          by: "hasan",
          day: "Today",
          time: "10:44",
          text: "",
          kind: "text",
          deleted: true,
        },
        {
          id: "sy1",
          by: "shoaib",
          day: "Today",
          time: "10:44",
          text: "",
          kind: "system",
          system: { act: "removed", by: "shoaib", who: ["omar"] },
        },
      ],
    },
  });

export const STATES: GalleryState[] = [
  {
    id: "signin",
    title: "Sign in",
    group: "Auth",
    render: () => (
      <SignInScreen
        email="hasan@q9labs.ai"
        onEmailChange={noop}
        onGoogle={noop}
        onApple={noop}
        onEmailCode={noop}
      />
    ),
  },
  {
    id: "code",
    title: "Email code",
    group: "Auth",
    render: () => (
      <CodeScreen
        email="hasan@q9labs.ai"
        code="481"
        onCodeChange={noop}
        error=""
        onResend={noop}
        onChangeEmail={noop}
      />
    ),
  },
  {
    id: "code-bad",
    title: "Email code, rejected",
    group: "Auth",
    render: () => (
      <CodeScreen
        email="hasan@q9labs.ai"
        code=""
        onCodeChange={noop}
        error="That code didn't work. Check it and try again."
        onResend={noop}
        onChangeEmail={noop}
      />
    ),
  },
  {
    id: "profile",
    title: "Set up profile",
    group: "Auth",
    render: () => (
      <ProfileScreen
        email="nadia@q9labs.ai"
        name="Nadia"
        onNameChange={noop}
        avatar={avatarOf("nadia")}
        hasPhoto={false}
        onTogglePhoto={noop}
        onContinue={noop}
        onSignOut={noop}
      />
    ),
  },
  {
    id: "profile-photo",
    title: "Set up profile, with photo",
    group: "Auth",
    render: () => (
      <ProfileScreen
        email="nadia@q9labs.ai"
        name="Nadia"
        onNameChange={noop}
        avatar={avatarOf("nadia", photoUri)}
        hasPhoto
        onTogglePhoto={noop}
        onContinue={noop}
        onSignOut={noop}
      />
    ),
  },

  { id: "groups", title: "Groups", group: "Groups", render: () => groupsScreen() },
  {
    id: "groups-offline",
    title: "Groups, offline",
    group: "Groups",
    render: () => groupsScreen({ offline: true }),
  },
  {
    id: "groups-offline-unloaded",
    title: "Groups, offline before the first load",
    group: "Groups",
    render: () => (
      <GroupsScreen
        {...groupsHandlers}
        me={avatarOf(ME)}
        rows={null}
        offline
        showPermissionBanner={false}
        toast={null}
      />
    ),
  },
  {
    id: "groups-long",
    title: "Groups, long names",
    group: "Groups",
    render: () => groupsScreen({ world: longWorld() }),
  },
  {
    id: "groups-removed",
    title: "Groups, removed row",
    group: "Groups",
    render: () => groupsScreen({ removed: true }),
  },
  {
    id: "groups-toast",
    title: "Groups, toast",
    group: "Groups",
    render: () => groupsScreen({ toast: "Removed from your list" }),
  },
  {
    id: "groups-first-run",
    title: "Groups, first run",
    group: "Groups",
    render: () => (
      <GroupsScreen
        {...groupsHandlers}
        me={avatarOf("nadia")}
        rows={[]}
        offline={false}
        showPermissionBanner
        toast={null}
      />
    ),
  },

  { id: "chat", title: "Chat", group: "Chat", render: () => chat("launch") },
  { id: "chat-pair", title: "Chat, group of two", group: "Chat", render: () => chat("shoaib") },
  {
    id: "chat-muted",
    title: "Chat, muted group",
    group: "Chat",
    render: () => chat("random", {}, { typing: 0 }),
  },
  {
    id: "chat-tap",
    title: "Chat, tapped message shows its time",
    group: "Chat",
    render: () => chat("launch", { tappedMessageId: "l12" }),
  },
  {
    id: "chat-typing3",
    title: "Chat, three typing",
    group: "Chat",
    render: () => chat("launch", {}, { typing: 3 }),
  },
  {
    id: "chat-sheet-mine",
    title: "Message sheet, your message",
    group: "Chat",
    render: () => chat("launch", { sheet: { type: "message", messageId: "l8" } }),
  },
  {
    id: "chat-sheet-other",
    title: "Message sheet, their message",
    group: "Chat",
    render: () => chat("launch", { sheet: { type: "message", messageId: "l12" } }),
  },
  {
    id: "chat-reactions",
    title: "Reactions sheet",
    group: "Chat",
    render: () => chat("launch", { sheet: { type: "reactions", messageId: "l9" } }),
  },
  {
    id: "chat-attach",
    title: "Attach sheet",
    group: "Chat",
    render: () => chat("launch", { sheet: { type: "attach" } }),
  },
  {
    id: "chat-delete",
    title: "Delete confirmation",
    group: "Chat",
    render: () => chat("launch", { sheet: { type: "delete", messageId: "l8" } }),
  },
  {
    id: "chat-report",
    title: "Report, no reason",
    group: "Chat",
    render: () => chat("launch", { sheet: { type: "report", messageId: "l12", reason: null } }),
  },
  {
    id: "chat-report-spam",
    title: "Report, reason chosen",
    group: "Chat",
    render: () => chat("launch", { sheet: { type: "report", messageId: "l12", reason: "Spam" } }),
  },
  {
    id: "chat-reply",
    title: "Composer, replying",
    group: "Chat",
    render: () =>
      chat("launch", {
        composer: {
          kind: "reply",
          author: "Bilal",
          summary: "Build 1 is up on TestFlight. @Hasan can you try sign in with Apple?",
        },
      }),
  },
  {
    id: "chat-edit",
    title: "Composer, editing",
    group: "Chat",
    render: () =>
      chat("launch", {
        composer: { kind: "edit" },
        draft: "Web goes up on chat.q9labs.ai tonight. Phone builds are going through EAS.",
      }),
  },
  {
    id: "chat-draft",
    title: "Composer, with text",
    group: "Chat",
    render: () => chat("launch", { draft: "On it. I'll test Apple sign in tonight." }),
  },
  {
    id: "chat-recording",
    title: "Composer, recording",
    group: "Chat",
    render: () =>
      chat("launch", { composer: { kind: "recording", seconds: 0, levels: waveSamples(11, 30) } }),
  },
  {
    id: "chat-offline",
    title: "Chat, offline with a queued message",
    group: "Chat",
    render: () => chat("launch", { offline: true }, { world: queuedWorld(), unread: 0 }),
  },
  {
    id: "chat-sending",
    title: "Chat, sending",
    group: "Chat",
    render: () => chat("launch", {}, { world: sendingWorld(), unread: 0 }),
  },
  {
    id: "chat-failed",
    title: "Chat, failed send",
    group: "Chat",
    render: () => chat("launch", {}, { world: failedWorld(), unread: 0 }),
  },
  {
    id: "chat-events",
    title: "Chat, deleted message and removal line",
    group: "Chat",
    render: () => chat("launch", { subtitle: "4 members" }, { world: eventsWorld(), unread: 0 }),
  },
  {
    id: "chat-long",
    title: "Chat, long names and long message",
    group: "Chat",
    render: () => chat("launch", {}, { world: longWorld() }),
  },
  {
    id: "chat-removed",
    title: "Chat, removed from group",
    group: "Chat",
    render: () => chat("launch", { removed: { by: "Shoaib", when: "today at 10:44" } }),
  },

  { id: "info", title: "Group info", group: "Group info", render: () => info("launch") },
  {
    id: "info-pair",
    title: "Group info, group of two",
    group: "Group info",
    render: () => info("shoaib"),
  },
  {
    id: "info-muted",
    title: "Group info, muted",
    group: "Group info",
    render: () => info("random"),
  },
  {
    id: "info-long",
    title: "Group info, long names",
    group: "Group info",
    render: () => info("launch", {}, longWorld()),
  },
  {
    id: "info-copied",
    title: "Group info, link copied",
    group: "Group info",
    render: () => info("launch", { copied: true, toast: "Invite link copied" }),
  },
  {
    id: "info-notify",
    title: "Notifications sheet",
    group: "Group info",
    render: () => info("launch", { sheet: { type: "notify" } }),
  },
  {
    id: "info-member",
    title: "Member options sheet",
    group: "Group info",
    render: () => info("launch", { sheet: { type: "member", personId: "sara" } }),
  },
  {
    id: "info-remove",
    title: "Remove confirmation",
    group: "Group info",
    render: () => info("launch", { sheet: { type: "removeMember", personId: "omar" } }),
  },
  {
    id: "info-leave",
    title: "Leave confirmation",
    group: "Group info",
    render: () => info("launch", { sheet: { type: "leave" } }),
  },
  {
    id: "info-removed",
    title: "Group info, removed",
    group: "Group info",
    render: () =>
      info("launch", {
        info: {
          status: "removed",
          title: "Q9 Chat launch",
          avatar: groupAvatar(groupById("launch")),
          memberCount: groupById("launch").members.length,
        },
      }),
  },

  {
    id: "newgroup",
    title: "New group",
    group: "New group",
    render: () =>
      newGroup({
        groupName: "Beta testers",
        people: people("sara", "bilal"),
        query: "lina@studio.co",
        hint: { kind: "noAccount", email: "lina@studio.co" },
        primaryEnabled: true,
      }),
  },
  {
    id: "newgroup-empty",
    title: "New group, empty",
    group: "New group",
    render: () => newGroup({}),
  },
  {
    id: "newgroup-suggest",
    title: "New group, suggestions",
    group: "New group",
    render: () =>
      newGroup({
        groupName: "Onboarding",
        people: people("hasan"),
        query: "s",
        suggestions: people("shoaib", "sara"),
        hint: null,
        primaryEnabled: true,
      }),
  },
  {
    id: "newgroup-start",
    title: "New group, one person",
    group: "New group",
    render: () =>
      newGroup({ people: people("omar"), hint: null, primaryLabel: "Start", primaryEnabled: true }),
  },
  {
    id: "newgroup-add",
    title: "Add people",
    group: "New group",
    render: () =>
      newGroup({ mode: "add", inviteLink: "chat.q9labs.ai/join/k7Pq2x", primaryLabel: "Add" }),
  },
  {
    id: "newgroup-add-picked",
    title: "Add people, one picked",
    group: "New group",
    render: () =>
      newGroup({
        mode: "add",
        people: people("yahya"),
        hint: null,
        inviteLink: "chat.q9labs.ai/join/k7Pq2x",
        primaryLabel: "Add",
        primaryEnabled: true,
      }),
  },

  {
    id: "search",
    title: "Search",
    group: "Search",
    render: () => (
      <SearchScreen
        {...searchHandlers}
        query="TestFlight"
        scopeTitle={null}
        hits={searchOf("TestFlight", w, null)}
      />
    ),
  },
  {
    id: "search-empty",
    title: "Search, empty",
    group: "Search",
    render: () => <SearchScreen {...searchHandlers} query="" scopeTitle={null} hits={[]} />,
  },
  {
    id: "search-none",
    title: "Search, no results",
    group: "Search",
    render: () => <SearchScreen {...searchHandlers} query="zebra" scopeTitle={null} hits={[]} />,
  },
  {
    id: "search-scoped",
    title: "Search in a group",
    group: "Search",
    render: () => (
      <SearchScreen
        {...searchHandlers}
        query="TestFlight"
        scopeTitle="Q9 Chat launch"
        hits={searchOf("TestFlight", w, "launch")}
      />
    ),
  },
  {
    id: "search-scoped-empty",
    title: "Search in a group, empty",
    group: "Search",
    render: () => (
      <SearchScreen {...searchHandlers} query="" scopeTitle="Q9 Chat launch" hits={[]} />
    ),
  },

  {
    id: "account",
    title: "Account",
    group: "Account",
    render: () => (
      <AccountScreen
        {...accountHandlers}
        me={{ person: personOf(ME, w), signedInWith: "Google" }}
        name={ME_FULL_NAME}
        hasPhoto={false}
        confirmDelete={false}
        toast={null}
      />
    ),
  },
  {
    id: "account-photo",
    title: "Account, with photo",
    group: "Account",
    render: () => (
      <AccountScreen
        {...accountHandlers}
        me={{ person: personOf(ME, w, photoUri), signedInWith: "Google" }}
        name={ME_FULL_NAME}
        hasPhoto
        confirmDelete={false}
        toast={null}
      />
    ),
  },
  {
    id: "account-new",
    title: "Account, new person",
    group: "Account",
    render: () => (
      <AccountScreen
        {...accountHandlers}
        me={{
          person: { ...personOf("nadia", w), isYou: true, fullName: "Nadia" },
          signedInWith: "Email code",
        }}
        name="Nadia"
        hasPhoto={false}
        confirmDelete={false}
        toast={null}
      />
    ),
  },
  {
    id: "account-delete",
    title: "Delete account confirmation",
    group: "Account",
    render: () => (
      <AccountScreen
        {...accountHandlers}
        me={{ person: personOf(ME, w), signedInWith: "Google" }}
        name={ME_FULL_NAME}
        hasPhoto={false}
        confirmDelete
        toast={null}
      />
    ),
  },
  {
    id: "offline-restore",
    title: "Saved session cannot be refreshed",
    group: "Auth",
    render: () => <OfflineRestoreScreen onRetry={noop} onSignOut={noop} />,
  },
  {
    id: "account-unsaved",
    title: "Name not saved, on leaving",
    group: "Account",
    render: () => (
      <AccountScreen
        {...accountHandlers}
        me={{ person: personOf(ME, w), signedInWith: "Google" }}
        name=""
        hasPhoto={false}
        confirmDelete={false}
        toast={null}
        unsaved={{
          title: "Your name isn't saved",
          text: "Enter a name of 1 to 60 characters, or discard your change.",
          confirmLabel: "Discard changes",
          cancelLabel: "Keep editing",
          onKeepEditing: noop,
          onDiscard: noop,
        }}
      />
    ),
  },
  {
    id: "account-unsaved-offline",
    title: "Name not saved, offline before saving",
    group: "Account",
    render: () => (
      <AccountScreen
        {...accountHandlers}
        me={{ person: personOf(ME, w), signedInWith: "Google" }}
        name="Nadia Jo"
        hasPhoto={false}
        confirmDelete={false}
        toast={null}
        unsaved={{
          title: "Your name isn't saved",
          text: "You're offline, so your name can't be saved. Keep editing, or discard your change.",
          confirmLabel: "Discard changes",
          cancelLabel: "Keep editing",
          onKeepEditing: noop,
          onDiscard: noop,
        }}
      />
    ),
  },
  {
    id: "account-save-waiting",
    title: "Name save waiting for the connection",
    group: "Account",
    render: () => (
      <AccountScreen
        {...accountHandlers}
        me={{ person: personOf(ME, w), signedInWith: "Google" }}
        name="Nadia Jo"
        hasPhoto={false}
        confirmDelete={false}
        toast={null}
        unsaved={{
          title: "Your name isn't saved",
          text: "You're offline, so your name hasn't saved yet. It may still save when you're back online.",
          confirmLabel: "Leave anyway",
          cancelLabel: "Stay here",
          onKeepEditing: noop,
          onDiscard: noop,
        }}
      />
    ),
  },
  {
    id: "account-photo-pending",
    title: "Photo change not finished, on leaving",
    group: "Account",
    render: () => (
      <AccountScreen
        {...accountHandlers}
        me={{ person: personOf(ME, w), signedInWith: "Google" }}
        name="Nadia"
        hasPhoto={false}
        confirmDelete={false}
        toast={null}
        unsaved={{
          title: "Your photo isn't saved",
          text: "Your photo change isn't done yet. If you leave now, it may not be saved.",
          confirmLabel: "Leave anyway",
          cancelLabel: "Stay here",
          onKeepEditing: noop,
          onDiscard: noop,
        }}
      />
    ),
  },
];

export const stateById = (id: string): GalleryState | undefined =>
  STATES.find((state) => state.id === id);
