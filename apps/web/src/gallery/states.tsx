import type { ReactNode } from "react";

import { EmailCode, SetUpProfile, SignIn } from "../screens/auth.js";
import {
  AccountDialog,
  DeleteAccountDialog,
  DeleteMessageDialog,
  LeaveGroupDialog,
  NewGroupDialog,
  RemoveMemberDialog,
  ReportDialog,
  SearchDialog,
} from "../screens/dialogs.js";
import { BrowserPermissionPrompt, DesktopNotification } from "../screens/system.js";
import { Toast } from "../ui/overlay.js";
import {
  avatarOf,
  createdLines,
  groupRows,
  launchGroup,
  launchMessages,
  match,
  me,
  pairGroup,
  pairMessages,
  recordingLevels,
  removalLine,
  removedGroup,
  searchHits,
  withMuted,
  withRemoved,
  unsentMessage,
  type Options,
} from "./fixtures.js";
import { Playground } from "./playground.js";
import { ChatScene, GroupsScene } from "./scene.js";

const noop = () => {};

export interface GalleryState {
  readonly id: string;
  readonly title: string;
  readonly render: () => ReactNode;
}

const LONG: Options = { long: true };
const NEW_PERSON: Options = { me: "nadia" };

function newGroup(overrides: Partial<Parameters<typeof NewGroupDialog>[0]> = {}) {
  return (
    <NewGroupDialog
      mode="new"
      name="Beta testers"
      onNameChange={noop}
      people={[match("sara"), match("bilal")]}
      onRemovePerson={noop}
      query="lina@studio.co"
      onQueryChange={noop}
      suggestions={[]}
      onPick={noop}
      unknownEmail="lina@studio.co"
      pairExists={false}
      inviteToken="b7Tx4k"
      linkCopied={false}
      onCopyLink={noop}
      onSubmit={noop}
      onClose={noop}
      {...overrides}
    />
  );
}

function search(
  overrides: Partial<Parameters<typeof SearchDialog>[0]> = {},
  options: Options = {},
) {
  return (
    <SearchDialog
      query="TestFlight"
      onQueryChange={noop}
      scopeTitle={null}
      onClearScope={noop}
      hits={searchHits(options)}
      onOpenHit={noop}
      onClose={noop}
      {...overrides}
    />
  );
}

function account(options: Options = {}) {
  return (
    <AccountDialog
      me={me(options)}
      name={me(options).displayName}
      onNameChange={noop}
      onUploadPhoto={noop}
      onRemovePhoto={noop}
      onDeleteAccount={noop}
      onSignOut={noop}
      onClose={noop}
    />
  );
}

const DIGITS = ["4", "8", "1", "", "", ""];

export const STATES: readonly GalleryState[] = [
  {
    id: "signin",
    title: "Sign in",
    render: () => (
      <SignIn
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
    render: () => (
      <EmailCode
        email="hasan@q9labs.ai"
        digits={DIGITS}
        onDigitsChange={noop}
        bad={false}
        onResend={noop}
        onUseDifferentEmail={noop}
      />
    ),
  },
  {
    id: "code-bad",
    title: "Email code, rejected",
    render: () => (
      <EmailCode
        email="hasan@q9labs.ai"
        digits={["0", "0", "0", "0", "0", "0"]}
        onDigitsChange={noop}
        bad
        onResend={noop}
        onUseDifferentEmail={noop}
      />
    ),
  },
  {
    id: "profile",
    title: "Set up profile",
    render: () => (
      <SetUpProfile
        name="Nadia"
        onNameChange={noop}
        email="nadia@q9labs.ai"
        avatar={avatarOf("nadia")}
        onTogglePhoto={noop}
        onContinue={noop}
      />
    ),
  },
  { id: "groups", title: "Groups, no chat open", render: () => <GroupsScene /> },
  {
    id: "groups-empty",
    title: "Groups, first run",
    render: () => <GroupsScene options={NEW_PERSON} empty banner />,
  },
  { id: "chat", title: "Chat", render: () => <ChatScene /> },
  {
    id: "chat-hover-theirs",
    title: "Chat, actions beside their message",
    render: () => <ChatScene />,
  },
  {
    id: "chat-hover-mine",
    title: "Chat, actions beside your message",
    render: () => <ChatScene />,
  },
  {
    id: "chat-more-theirs",
    title: "Chat, More menu on their message",
    render: () => <ChatScene menuMessageId="l12" />,
  },
  {
    id: "chat-more-mine",
    title: "Chat, More menu on your message",
    render: () => <ChatScene menuMessageId="l8" />,
  },
  { id: "chat-chip-tip", title: "Chat, reaction tooltip", render: () => <ChatScene /> },
  {
    id: "chat-offline",
    title: "Chat, offline",
    render: () => <ChatScene offline messages={[...launchMessages(), unsentMessage("queued")]} />,
  },
  {
    id: "chat-failed",
    title: "Chat, failed send",
    render: () => <ChatScene messages={[...launchMessages(), unsentMessage("failed")]} />,
  },
  {
    id: "chat-sending",
    title: "Chat, sending",
    render: () => <ChatScene messages={[...launchMessages(), unsentMessage("sending")]} />,
  },
  {
    id: "chat-muted",
    title: "Chat, muted group",
    render: () => (
      <ChatScene
        group={launchGroup({ notify: "muted" })}
        rows={withMuted(groupRows({}, ["launch"]), "launch")}
      />
    ),
  },
  {
    id: "chat-long",
    title: "Chat, long names and message",
    render: () => (
      <ChatScene
        options={LONG}
        group={launchGroup(LONG)}
        messages={launchMessages(LONG)}
        newFromSequence={11}
      />
    ),
  },
  {
    id: "chat-removed",
    title: "Chat, removed from group",
    render: () => (
      <ChatScene group={removedGroup()} rows={withRemoved(groupRows({}, ["launch"]), "launch")} />
    ),
  },
  {
    id: "chat-reply",
    title: "Chat, replying",
    render: () => (
      <ChatScene
        mode={{
          type: "reply",
          to: "Bilal",
          summary: "Build 1 is up on TestFlight. @Hasan can you try sign in with Apple?",
        }}
      />
    ),
  },
  {
    id: "chat-edit",
    title: "Chat, editing",
    render: () => (
      <ChatScene
        mode={{ type: "edit" }}
        draft="Web goes up on chat.q9labs.ai tonight. Phone builds are going through EAS."
      />
    ),
  },
  {
    id: "chat-draft",
    title: "Chat, long draft grows the pill",
    render: () => (
      <ChatScene
        draft={
          "Web is live.\nPhone builds are going through EAS.\nI will write the release notes tonight."
        }
      />
    ),
  },
  {
    id: "chat-recording",
    title: "Chat, recording",
    render: () => <ChatScene recording={{ elapsed: "0:07", levels: recordingLevels() }} />,
  },
  { id: "chat-attach", title: "Chat, attach menu", render: () => <ChatScene attachOpen /> },
  {
    id: "chat-voice-playing",
    title: "Chat, voice note playing",
    render: () => <ChatScene playing={{ messageId: "l10", progress: 0.5 }} />,
  },
  {
    id: "chat-system",
    title: "Chat, group events",
    render: () => <ChatScene messages={[...launchMessages(), ...createdLines()]} />,
  },
  {
    id: "chat-removal-line",
    title: "Chat, someone removed Omar",
    render: () => (
      <ChatScene
        group={{ ...launchGroup(), memberCount: 4 }}
        messages={[...launchMessages(), removalLine()]}
      />
    ),
  },
  {
    id: "chat-typing-2",
    title: "Chat, two people typing",
    render: () => <ChatScene typing={["Shoaib", "Bilal"]} />,
  },
  {
    id: "chat-typing-3",
    title: "Chat, three people typing",
    render: () => <ChatScene typing={["Shoaib", "Bilal", "Sara"]} />,
  },
  {
    id: "chat-pair",
    title: "Chat, group of two",
    render: () => (
      <ChatScene
        group={pairGroup()}
        messages={pairMessages()}
        selected="shoaib"
        newFromSequence={3}
      />
    ),
  },
  { id: "chat-banner", title: "Chat, notification banner", render: () => <ChatScene banner /> },
  { id: "info", title: "Group info", render: () => <ChatScene info={{}} /> },
  {
    id: "info-copied",
    title: "Group info, link copied",
    render: () => <ChatScene info={{ linkCopied: true }} />,
  },
  {
    id: "info-pair",
    title: "Group info, group of two",
    render: () => (
      <ChatScene
        group={pairGroup()}
        messages={pairMessages()}
        selected="shoaib"
        newFromSequence={3}
        info={{}}
      />
    ),
  },
  {
    id: "info-removed",
    title: "Group info, removed",
    render: () => (
      <ChatScene
        group={removedGroup()}
        rows={withRemoved(groupRows({}, ["launch"]), "launch")}
        info={{}}
      />
    ),
  },
  {
    id: "notify",
    title: "Notifications popover",
    render: () => <ChatScene info={{ notificationsOpen: true }} />,
  },
  {
    id: "notify-muted",
    title: "Notifications popover, muted",
    render: () => (
      <ChatScene
        group={launchGroup({ notify: "muted" })}
        rows={withMuted(groupRows({}, ["launch"]), "launch")}
        info={{ notificationsOpen: true }}
      />
    ),
  },
  { id: "newgroup", title: "New group", render: () => <ChatScene overlay={newGroup()} /> },
  {
    id: "newgroup-suggest",
    title: "New group, suggestions",
    render: () => (
      <ChatScene
        overlay={newGroup({
          name: "",
          people: [],
          query: "s",
          suggestions: [match("shoaib"), match("sara")],
          unknownEmail: null,
        })}
      />
    ),
  },
  {
    id: "newgroup-empty",
    title: "New group, empty",
    render: () => (
      <ChatScene overlay={newGroup({ name: "", people: [], query: "", unknownEmail: null })} />
    ),
  },
  {
    id: "newgroup-one",
    title: "New group, open a group of two",
    render: () => (
      <ChatScene
        overlay={newGroup({
          name: "",
          people: [match("sara")],
          query: "",
          unknownEmail: null,
          pairExists: true,
        })}
      />
    ),
  },
  {
    id: "newgroup-start",
    title: "New group, start a group of two",
    render: () => (
      <ChatScene
        overlay={newGroup({ name: "", people: [match("rana")], query: "", unknownEmail: null })}
      />
    ),
  },
  {
    id: "newgroup-add",
    title: "Add people",
    render: () => (
      <ChatScene
        overlay={newGroup({
          mode: "add",
          groupTitle: "Q9 Chat launch",
          name: "",
          people: [],
          query: "",
          unknownEmail: null,
          inviteToken: "k7Pq2x",
        })}
      />
    ),
  },
  {
    id: "newgroup-add-one",
    title: "Add people, one picked",
    render: () => (
      <ChatScene
        overlay={newGroup({
          mode: "add",
          groupTitle: "Q9 Chat launch",
          name: "",
          people: [match("yahya")],
          query: "",
          unknownEmail: null,
          inviteToken: "k7Pq2x",
        })}
      />
    ),
  },
  { id: "search", title: "Search, all groups", render: () => <ChatScene overlay={search()} /> },
  {
    id: "search-scoped",
    title: "Search, one group",
    render: () => (
      <ChatScene
        overlay={search({
          scopeTitle: "Q9 Chat launch",
          hits: searchHits().filter((hit) => hit.groupId === "launch"),
        })}
      />
    ),
  },
  {
    id: "search-empty",
    title: "Search, empty",
    render: () => <ChatScene overlay={search({ query: "", hits: [] })} />,
  },
  {
    id: "search-empty-scoped",
    title: "Search, empty in a group",
    render: () => (
      <ChatScene overlay={search({ query: "", hits: [], scopeTitle: "Q9 Chat launch" })} />
    ),
  },
  {
    id: "search-none",
    title: "Search, no matches",
    render: () => <ChatScene overlay={search({ query: "zzz", hits: [] })} />,
  },
  { id: "account", title: "Account", render: () => <ChatScene overlay={account()} /> },
  {
    id: "account-photo",
    title: "Account, with photo",
    render: () => <ChatScene options={{ photo: true }} overlay={account({ photo: true })} />,
  },
  {
    id: "account-new",
    title: "Account, email code",
    render: () => <GroupsScene options={NEW_PERSON} empty banner overlay={account(NEW_PERSON)} />,
  },
  {
    id: "delete-message",
    title: "Delete message",
    render: () => <ChatScene overlay={<DeleteMessageDialog onConfirm={noop} onClose={noop} />} />,
  },
  {
    id: "report",
    title: "Report message",
    render: () => (
      <ChatScene
        overlay={
          <ReportDialog
            authorName="Bilal"
            reason={null}
            onReasonChange={noop}
            onSend={noop}
            onClose={noop}
          />
        }
      />
    ),
  },
  {
    id: "report-picked",
    title: "Report message, reason picked",
    render: () => (
      <ChatScene
        overlay={
          <ReportDialog
            authorName="Bilal"
            reason="harassment"
            onReasonChange={noop}
            onSend={noop}
            onClose={noop}
          />
        }
      />
    ),
  },
  {
    id: "remove-member",
    title: "Remove member",
    render: () => (
      <ChatScene
        info={{}}
        overlay={
          <RemoveMemberDialog
            name="Omar"
            groupTitle="Q9 Chat launch"
            onConfirm={noop}
            onClose={noop}
          />
        }
      />
    ),
  },
  {
    id: "leave",
    title: "Leave group",
    render: () => (
      <ChatScene
        info={{}}
        overlay={<LeaveGroupDialog groupTitle="Q9 Chat launch" onConfirm={noop} onClose={noop} />}
      />
    ),
  },
  {
    id: "delete-account",
    title: "Delete account",
    render: () => <ChatScene overlay={<DeleteAccountDialog onConfirm={noop} onClose={noop} />} />,
  },
  { id: "toast", title: "Toast", render: () => <ChatScene overlay={<Toast message="Copied" />} /> },
  {
    id: "desktop-notification",
    title: "Desktop notification",
    render: () => (
      <ChatScene
        overlay={
          <DesktopNotification
            title="Yahya in Chalk"
            text="@Hasan the recording bug is back on Safari. Can you look before the demo?"
            onOpen={noop}
            onDismiss={noop}
          />
        }
      />
    ),
  },
  {
    id: "permission-prompt",
    title: "Browser permission prompt",
    render: () => (
      <GroupsScene
        options={NEW_PERSON}
        empty
        overlay={<BrowserPermissionPrompt onBlock={noop} onAllow={noop} />}
      />
    ),
  },
  { id: "playground", title: "Live chat for the keyboard check", render: () => <Playground /> },
];
