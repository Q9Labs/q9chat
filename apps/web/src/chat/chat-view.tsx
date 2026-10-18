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

/** Group avatar and name (opens Group info), the member count, and the two quiet tools. */
export function ChatHeader({ group, onOpenInfo, onSearchGroup }: ChatHeaderProps) {
  const member = group.status === "member" ? group : null;
  const muted = member?.notify === "muted";
  return (
    <header className="chead">
      <button
        type="button"
        className="ctitle"
        aria-label={`Group info for ${group.title}${muted ? ", muted" : ""}`}
        onClick={onOpenInfo}
      >
        <Avatar avatar={group.avatar} />
        <span>
          <b>
            <span className="tt">{group.title}</span>
            {muted ? <Icon name="bellOff" /> : null}
          </b>
          {member === null || member.kind === "pair" ? null : (
            <small>{member.memberCount} members</small>
          )}
        </span>
      </button>
      <span className="spacer" />
      {member === null ? null : (
        <>
          <IconButton
            icon="search"
            label="Search in this group"
            tip="Search in this group"
            onClick={onSearchGroup}
          />
          <IconButton icon="info" label="Group info" tip="Group info" onClick={onOpenInfo} />
        </>
      )}
    </header>
  );
}

/** "You're offline. Messages send when you're back." */
export function OfflineBanner() {
  return (
    <output className="offl">
      <Icon name="wifiOff" />
      <span>You're offline. Messages send when you're back.</span>
    </output>
  );
}

export function EmptyState({
  icon,
  title,
  children,
}: {
  readonly icon: "users" | "ban";
  readonly title?: string;
  readonly children: React.ReactNode;
}) {
  return (
    <div className="center">
      <span className="ebadge">
        <Icon name={icon} />
      </span>
      {title === undefined ? null : <h2>{title}</h2>}
      {children}
    </div>
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
  const { clock } = useRoot();
  if (group.status === "removed") {
    return (
      <>
        <ChatHeader group={group} onOpenInfo={onOpenInfo} onSearchGroup={onSearchGroup} />
        <div className="center">
          <span className="ebadge">
            <Icon name="ban" />
          </span>
          <h2>You were removed from this group</h2>
          <p>
            {group.removedBy} removed you {whenLabel(group.removedAt, clock)}. Only members can read
            a group, so its messages are hidden.
          </p>
          <div className="acts2">
            <Button onClick={onForget}>Remove from my list</Button>
          </div>
        </div>
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
