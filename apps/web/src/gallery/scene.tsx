import type { ReactNode } from "react";

import { ChatView } from "../chat/chat-view.js";
import type { ComposerMode, ComposerProps, Recording } from "../chat/composer.js";
import type { MessageHandlers } from "../chat/message.js";
import type {
  GroupDetail,
  GroupListRow,
  MessageView,
  NotifyMode,
  RemovedGroup,
} from "../chat/types.js";
import { GroupInfo } from "../screens/group-info.js";
import { ChatShell, PickAGroup } from "../screens/shell.js";
import { NoGroupsYet, PermissionBanner, Sidebar } from "../screens/sidebar.js";
import { AppRoot } from "../ui/root.js";
import { CLOCK, groupRows, launchGroup, launchMessages, me, type Options } from "./fixtures.js";

const noop = () => {};

export const HANDLERS: MessageHandlers = {
  onReact: noop,
  onReply: noop,
  onEdit: noop,
  onCopy: noop,
  onDelete: noop,
  onReport: noop,
  onRetry: noop,
  onOpenQuote: noop,
  onTogglePlay: noop,
  onMenuOpenChange: noop,
};

export interface ChatScene {
  readonly options?: Options;
  readonly rows?: readonly GroupListRow[];
  readonly selected?: string | null;
  readonly banner?: boolean;
  readonly group?: GroupDetail | RemovedGroup;
  readonly messages?: readonly MessageView[];
  readonly newFromSequence?: number | null;
  readonly typing?: readonly string[];
  readonly offline?: boolean;
  readonly menuMessageId?: string | null;
  readonly highlightId?: string | null;
  readonly playing?: { readonly messageId: string; readonly progress: number } | null;
  readonly draft?: string;
  readonly mode?: ComposerMode | null;
  readonly recording?: Recording | null;
  readonly attachOpen?: boolean;
  readonly info?: {
    readonly notify?: NotifyMode;
    readonly notificationsOpen?: boolean;
    readonly linkCopied?: boolean;
    readonly group?: GroupDetail | RemovedGroup;
  } | null;
  /** Dialogs and popovers drawn over the screen. */
  readonly overlay?: ReactNode;
  /** The playground wires these to local state; every other state leaves them as no-ops. */
  readonly onOpenSearch?: () => void;
  readonly composerHandlers?: Partial<ComposerProps>;
}

/** The signed-in app with a chat open: sidebar, history, composer and optionally Group info. */
export function ChatScene(scene: ChatScene) {
  const options = scene.options ?? {};
  const group = scene.group ?? launchGroup(options);
  const info = scene.info;
  const infoGroup = info?.group ?? group;
  return (
    <>
      <ChatShell
        onOpenSearch={scene.onOpenSearch ?? noop}
        sidebar={
          <Sidebar
            me={me(options)}
            rows={scene.rows ?? groupRows(options, ["launch", scene.selected ?? "launch"])}
            selectedGroupId={scene.selected === undefined ? "launch" : scene.selected}
            onSelect={noop}
            onNewGroup={noop}
            onSearch={noop}
            onAccount={noop}
          />
        }
        banner={
          scene.banner === true ? <PermissionBanner onLater={noop} onTurnOn={noop} /> : undefined
        }
        main={
          <ChatView
            group={group}
            offline={scene.offline === true}
            onOpenInfo={noop}
            onSearchGroup={noop}
            onForget={noop}
            timeline={{
              messages: scene.messages ?? launchMessages(options),
              newFromSequence: scene.newFromSequence === undefined ? 10 : scene.newFromSequence,
              typing: scene.typing ?? ["Shoaib"],
              handlers: HANDLERS,
              onOpenAuthor: noop,
              menuMessageId: scene.menuMessageId ?? null,
              highlightId: scene.highlightId ?? null,
              playing: scene.playing ?? null,
            }}
            composer={{
              title: group.title,
              value: scene.draft ?? "",
              onChange: noop,
              onSend: noop,
              mode: scene.mode ?? null,
              onCancelMode: noop,
              onEditLast: noop,
              attachOpen: scene.attachOpen === true,
              onAttachOpenChange: noop,
              onPickAttachment: noop,
              onRecord: noop,
              recording: scene.recording ?? null,
              onCancelRecording: noop,
              onSendRecording: noop,
              ...scene.composerHandlers,
            }}
          />
        }
        info={
          info === null || info === undefined ? undefined : (
            <GroupInfo
              group={
                infoGroup.status === "member" && info.notify !== undefined
                  ? { ...infoGroup, notify: info.notify }
                  : infoGroup
              }
              onClose={noop}
              onAddPeople={noop}
              onCopyLink={noop}
              linkCopied={info.linkCopied === true}
              onSearch={noop}
              notificationsOpen={info.notificationsOpen === true}
              onNotificationsOpenChange={noop}
              onNotifyChange={noop}
              onMessageMember={noop}
              onRemoveMember={noop}
              onLeave={noop}
            />
          )
        }
      />
      {scene.overlay}
    </>
  );
}

const NO_OPTIONS: Options = {};

/** The signed-in app with no chat open. */
export function GroupsScene({
  options = NO_OPTIONS,
  empty = false,
  banner = false,
  overlay,
}: {
  readonly options?: Options;
  readonly empty?: boolean;
  readonly banner?: boolean;
  readonly overlay?: ReactNode;
}) {
  return (
    <>
      <ChatShell
        onOpenSearch={noop}
        sidebar={
          <Sidebar
            me={me(options)}
            rows={empty ? [] : groupRows(options)}
            selectedGroupId={null}
            onSelect={noop}
            onNewGroup={noop}
            onSearch={noop}
            onAccount={noop}
          />
        }
        banner={banner ? <PermissionBanner onLater={noop} onTurnOn={noop} /> : undefined}
        main={empty ? <NoGroupsYet onNewGroup={noop} /> : <PickAGroup />}
      />
      {overlay}
    </>
  );
}

/** The 1280 by 800 frame the mock is drawn in. */
export function Frame({
  theme,
  children,
}: {
  readonly theme: "light" | "dark";
  readonly children: ReactNode;
}) {
  return (
    <div id="frame" style={{ position: "relative", width: 1280, height: 800, overflow: "hidden" }}>
      <AppRoot theme={theme} clock={CLOCK}>
        {children}
      </AppRoot>
    </div>
  );
}
