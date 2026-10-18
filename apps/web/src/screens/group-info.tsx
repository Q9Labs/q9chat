import { useState } from "react";

import type { GroupDetail, Member, NotifyMode, RemovedGroup } from "../chat/types.js";
import { Avatar } from "../ui/avatar.js";
import { IconButton, LinkBox, RadioList, SwitchRow } from "../ui/controls.js";
import { Icon, type IconName } from "../ui/icons.js";
import { Popover } from "../ui/overlay.js";

const NOTIFY_LABEL: Readonly<Record<NotifyMode, string>> = {
  mentions: "Mentions and replies",
  all: "All messages",
  muted: "Muted",
};

const NOTIFY_DESCRIPTION: Readonly<Record<NotifyMode, string>> = {
  mentions: "Only when someone mentions you or replies to you.",
  all: "Every new message in this group.",
  muted: "No notifications. The unread count turns grey.",
};

const NOTIFY_ICON: Readonly<Record<NotifyMode, IconName>> = {
  mentions: "bell",
  all: "bellAll",
  muted: "bellOff",
};

interface NotificationsPopoverProps {
  readonly title: string;
  readonly value: NotifyMode;
  readonly anchor: HTMLElement | null;
  readonly onChange: (mode: NotifyMode) => void;
  readonly onClose: () => void;
}

/** The three notification choices for one group, anchored under the Notifications row. */
function NotificationsPopover({
  title,
  value,
  anchor,
  onChange,
  onClose,
}: NotificationsPopoverProps) {
  return (
    <Popover label="Notifications" anchor={anchor} onClose={onClose}>
      <h3>Notifications for {title}</h3>
      <RadioList
        label="Notifications"
        value={value}
        onChange={onChange}
        options={(["mentions", "all", "muted"] as const).map((mode) => ({
          value: mode,
          label: NOTIFY_LABEL[mode],
          suffix: mode === "mentions" ? "· Default" : undefined,
          description: NOTIFY_DESCRIPTION[mode],
        }))}
      />
    </Popover>
  );
}

interface GroupInfoProps {
  readonly group: GroupDetail | RemovedGroup;
  readonly onClose: () => void;
  readonly onAddPeople: () => void;
  readonly onCopyLink: () => void;
  readonly linkCopied: boolean;
  readonly inviteUrl?: string;
  readonly onSearch: () => void;
  readonly notificationsOpen: boolean;
  readonly onNotificationsOpenChange: (open: boolean) => void;
  readonly onNotifyChange: (mode: NotifyMode) => void;
  readonly onMessageMember: (member: Member) => void;
  readonly onRemoveMember: (member: Member) => void;
  readonly onLeave: () => void;
}

function InfoHead({ onClose }: { readonly onClose: () => void }) {
  return (
    <div className="info-head">
      <span>Group info</span>
      <IconButton icon="x" label="Close group info" onClick={onClose} />
    </div>
  );
}

function InfoHero({ group }: { readonly group: GroupDetail | RemovedGroup }) {
  return (
    <div className="info-hero">
      <Avatar avatar={group.avatar} size="xl" />
      <h3>{group.title}</h3>
      {group.status === "member" && group.kind === "group" ? (
        <p>{group.memberCount} members</p>
      ) : null}
    </div>
  );
}

function QuickActions({
  onAddPeople,
  onCopyLink,
  onSearch,
}: Pick<GroupInfoProps, "onAddPeople" | "onCopyLink" | "onSearch">) {
  return (
    <div className="iqa">
      <button type="button" onClick={onAddPeople}>
        <Icon name="userPlus" />
        Add people
      </button>
      <button type="button" onClick={onCopyLink}>
        <Icon name="link" />
        Invite link
      </button>
      <button type="button" onClick={onSearch}>
        <Icon name="search" />
        Search
      </button>
    </div>
  );
}

/** The current notification mode as a row that opens the popover, and the quick mute switch. */
function NotificationSection({
  title,
  mode,
  open,
  onOpenChange,
  onChange,
}: {
  readonly title: string;
  readonly mode: NotifyMode;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onChange: (mode: NotifyMode) => void;
}) {
  const [row, setRow] = useState<HTMLButtonElement | null>(null);
  return (
    <>
      <div className="info-section">
        <h4>Notifications</h4>
        <button
          ref={setRow}
          type="button"
          className="info-row"
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => onOpenChange(true)}
        >
          <Icon name={NOTIFY_ICON[mode]} />
          <span className="it">
            {NOTIFY_LABEL[mode]}
            <small>{NOTIFY_DESCRIPTION[mode]}</small>
          </span>
          <span className="chevron">
            <Icon name="chevron" />
          </span>
        </button>
        <SwitchRow
          icon="bellOff"
          label="Mute this group"
          checked={mode === "muted"}
          onChange={(muted) => onChange(muted ? "muted" : "mentions")}
        />
      </div>
      {open ? (
        <NotificationsPopover
          title={title}
          value={mode}
          anchor={row}
          onClose={() => onOpenChange(false)}
          onChange={onChange}
        />
      ) : null}
    </>
  );
}

function MemberRow({
  member,
  onMessage,
  onRemove,
}: {
  readonly member: Member;
  readonly onMessage: (member: Member) => void;
  readonly onRemove: (member: Member) => void;
}) {
  return (
    <div className="mrow">
      <Avatar avatar={member.avatar} size="sm" />
      <span className="nm">
        <b>{member.isYou ? `${member.fullName} (you)` : member.fullName}</b>
      </span>
      {member.isYou ? null : (
        <span className="ma">
          <button type="button" className="member-button" onClick={() => onMessage(member)}>
            Message
          </button>
          <button type="button" className="member-button danger" onClick={() => onRemove(member)}>
            Remove
          </button>
        </span>
      )}
    </div>
  );
}

/** Members, the invite link and Leave: the parts a pair does not have. */
function GroupSections({
  group,
  linkCopied,
  inviteUrl,
  onAddPeople,
  onCopyLink,
  onMessageMember,
  onRemoveMember,
  onLeave,
}: Pick<
  GroupInfoProps,
  | "inviteUrl"
  | "linkCopied"
  | "onAddPeople"
  | "onCopyLink"
  | "onMessageMember"
  | "onRemoveMember"
  | "onLeave"
> & { readonly group: GroupDetail }) {
  return (
    <>
      <div className="info-section">
        <h4>{group.memberCount} members</h4>
        <button type="button" className="info-row" onClick={onAddPeople}>
          <Icon name="userPlus" />
          <span className="it">Add people</span>
        </button>
        {group.members.map((member) => (
          <MemberRow
            key={member.id}
            member={member}
            onMessage={onMessageMember}
            onRemove={onRemoveMember}
          />
        ))}
      </div>
      <div className="info-section">
        <h4>Invite link</h4>
        <LinkBox
          url={inviteUrl ?? `chat.q9labs.ai/join/${group.inviteToken ?? ""}`}
          copied={linkCopied}
          onCopy={onCopyLink}
        />
        <p className="note">Anyone with the link can join and read the whole group.</p>
      </div>
      <div className="info-section">
        <button type="button" className="info-row danger" onClick={onLeave}>
          <Icon name="logout" />
          <span className="it">Leave group</span>
        </button>
      </div>
    </>
  );
}

/**
 * The Group info panel at the inline end. A group shows quick actions, notifications, members,
 * the invite link and Leave; a pair shows only its title and the
 * notification settings; a removed viewer sees only a note.
 */
export function GroupInfo(props: GroupInfoProps) {
  const { group, onClose, notificationsOpen, onNotificationsOpenChange, onNotifyChange } = props;
  if (group.status === "removed") {
    return (
      <>
        <InfoHead onClose={onClose} />
        <div className="info-body">
          <InfoHero group={group} />
          <p className="note" style={{ textAlign: "center" }}>
            You were removed from this group.
          </p>
        </div>
      </>
    );
  }
  const pair = group.kind === "pair";
  return (
    <>
      <InfoHead onClose={onClose} />
      <div className="info-body">
        <InfoHero group={group} />
        {pair ? null : <QuickActions {...props} />}
        <NotificationSection
          title={group.title}
          mode={group.notify}
          open={notificationsOpen}
          onOpenChange={onNotificationsOpenChange}
          onChange={onNotifyChange}
        />
        {pair ? null : <GroupSections {...props} group={group} />}
      </div>
    </>
  );
}
