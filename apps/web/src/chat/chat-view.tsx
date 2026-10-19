import { Avatar } from "../ui/avatar.js";
import { Button, IconButton } from "../ui/controls.js";
import { Icon } from "../ui/icons.js";
import { useRoot } from "../ui/root.js";
import { Composer, ReadOnlyComposer, type ComposerProps } from "./composer.js";
import { whenLabel } from "./format.js";
import { Timeline, type TimelineProps } from "./timeline-view.js";
import type { GroupDetail, RemovedGroup } from "./types.js";

interface ChatHeaderProps {
  readonly group: GroupDetail | RemovedGroup;
  readonly onOpenInfo: () => void;
  readonly onSearchGroup: () => void;
}

function membersLabel(group: GroupDetail | RemovedGroup): string | null {
  if (group.status === "removed" || group.kind === "pair") return null;
  return `${group.memberCount} members`;
}

/** The group avatar, name and member count: one button that opens Group info. */
function ChatTitle({
  group,
  onOpenInfo,
}: {
  readonly group: GroupDetail | RemovedGroup;
  readonly onOpenInfo: () => void;
}) {
  const muted = group.status === "member" && group.notify === "muted";
  const members = membersLabel(group);
  return (
    <button
      type="button"
      className="chat-title"
      aria-label={`Group info for ${group.title}${muted ? ", muted" : ""}`}
      onClick={onOpenInfo}
    >
      <Avatar avatar={group.avatar} />
      <span>
        <b>
          <span className="tt">{group.title}</span>
          {muted ? <Icon name="bellOff" /> : null}
        </b>
        {members === null ? null : <small>{members}</small>}
      </span>
    </button>
  );
}

/** Group avatar and name (opens Group info), the member count, and the two quiet tools. */
export function ChatHeader({ group, onOpenInfo, onSearchGroup }: ChatHeaderProps) {
  return (
    <header className="chat-header">
      <ChatTitle group={group} onOpenInfo={onOpenInfo} />
      <span className="spacer" />
      {group.status === "member" ? (
        <>
          <IconButton
            icon="search"
            label="Search in this group"
            tip="Search in this group"
            onClick={onSearchGroup}
          />
          <IconButton icon="info" label="Group info" tip="Group info" onClick={onOpenInfo} />
        </>
      ) : null}
    </header>
  );
}

/** "You're offline. Messages send when you're back." */
function OfflineBanner() {
  return (
    <output className="offline-banner">
      <Icon name="wifiOff" />
      <span>You're offline. Messages send when you're back.</span>
    </output>
  );
}

interface ChatViewProps extends ChatHeaderProps {
  readonly offline: boolean;
  readonly timeline: TimelineProps;
  readonly composer: ComposerProps;
  /** "Remove from my list" in the removed view. */
  readonly onForget: () => void;
}

/** The chat column: header, history, composer. A removed viewer sees only the notice. */
export function ChatView({
  group,
  offline,
  timeline,
  composer,
  onOpenInfo,
  onSearchGroup,
  onForget,
}: ChatViewProps) {
  if (group.status === "removed") {
    return (
      <>
        <ChatHeader group={group} onOpenInfo={onOpenInfo} onSearchGroup={onSearchGroup} />
        <RemovedGroupNotice group={group} onForget={onForget} />
        <ReadOnlyComposer />
      </>
    );
  }
  return (
    <>
      <ChatHeader group={group} onOpenInfo={onOpenInfo} onSearchGroup={onSearchGroup} />
      {offline ? <OfflineBanner /> : null}
      <Timeline {...timeline} />
      <Composer {...composer} />
    </>
  );
}

export function RemovedGroupNotice({
  group,
  onForget,
  pending,
  error,
}: {
  readonly group: RemovedGroup;
  readonly onForget: () => void;
  readonly pending?: boolean;
  readonly error?: string;
}) {
  const { clock } = useRoot();
  return (
    <div className="center">
      <span className="empty-badge">
        <Icon name="ban" />
      </span>
      <h2>You were removed from this group</h2>
      <p>
        {group.removedBy} removed you {whenLabel(group.removedAt, clock)}. Only members can read a
        group, so its messages are hidden.
      </p>
      <div className="acts2">
        <Button disabled={pending} onClick={onForget}>
          Remove from my list
        </Button>
      </div>
      {error ? <p role="alert">{error}</p> : null}
    </div>
  );
}
