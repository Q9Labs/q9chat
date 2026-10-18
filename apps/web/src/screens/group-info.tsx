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
export function NotificationsPopover({
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
  readonly onSearch: () => void;
  readonly notificationsOpen: boolean;
  readonly onNotificationsOpenChange: (open: boolean) => void;
  readonly onNotifyChange: (mode: NotifyMode) => void;
  readonly onMessageMember: (member: Member) => void;
  readonly onRemoveMember: (member: Member) => void;
  readonly onLeave: () => void;
}

/**
 * The right-hand panel. A group shows quick actions, notifications, members,
 * the invite link and Leave; a pair shows only the partner's email and the
 * notification settings; a removed viewer sees only a note.
 */
export function GroupInfo(props: GroupInfoProps) {
  const {
    group,
    onClose,
    onAddPeople,
    onCopyLink,
    linkCopied,
    onSearch,
    notificationsOpen,
    onNotificationsOpenChange,
    onNotifyChange,
    onMessageMember,
    onRemoveMember,
    onLeave,
  } = props;
  const [notifyRow, setNotifyRow] = useState<HTMLButtonElement | null>(null);

  const head = (
    <div className="ihead">
      <span>Group info</span>
      <IconButton icon="x" label="Close group info" onClick={onClose} />
    </div>
  );

  if (group.status === "removed") {
    return (
      <>
        {head}
        <div className="ibody">
          <div className="ihero">
            <Avatar avatar={group.avatar} size="xl" />
            <h3>{group.title}</h3>
          </div>
          <p className="note" style={{ textAlign: "center" }}>
            You were removed from this group.
          </p>
        </div>
      </>
    );
  }

  const pair = group.kind === "pair";
  const mode = group.notify;
  return (
    <>
      {head}
      <div className="ibody">
        <div className="ihero">
          <Avatar avatar={group.avatar} size="xl" />
          <h3>{group.title}</h3>
          <p>{pair ? group.partner?.email : `${group.memberCount} members`}</p>
        </div>
        {pair ? null : (
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
        )}
        <div className="isec">
          <h4>Notifications</h4>
          <button
            ref={setNotifyRow}
            type="button"
            className="irow"
            aria-haspopup="dialog"
            aria-expanded={notificationsOpen}
            onClick={() => onNotificationsOpenChange(true)}
          >
            <Icon name={NOTIFY_ICON[mode]} />
            <span className="it">
              {NOTIFY_LABEL[mode]}
              <small>{NOTIFY_DESCRIPTION[mode]}</small>
            </span>
            <span className="chev">
              <Icon name="chev" />
            </span>
          </button>
          <SwitchRow
            icon="bellOff"
            label="Mute this group"
            checked={mode === "muted"}
            onChange={(muted) => onNotifyChange(muted ? "muted" : "mentions")}
          />
        </div>
        {pair ? null : (
          <>
            <div className="isec">
              <h4>{group.memberCount} members</h4>
              <button type="button" className="irow" onClick={onAddPeople}>
                <Icon name="userPlus" />
                <span className="it">Add people</span>
              </button>
              {group.members.map((member) => (
                <div key={member.id} className="mrow">
                  <Avatar avatar={member.avatar} size="sm" />
                  <span className="nm">
                    <b>{member.isYou ? `${member.fullName} (you)` : member.fullName}</b>
                    <small>{member.email}</small>
                  </span>
                  {member.isYou ? null : (
                    <span className="ma">
                      <button
                        type="button"
                        className="mbtn"
                        onClick={() => onMessageMember(member)}
                      >
                        Message
                      </button>
                      <button
                        type="button"
                        className="mbtn danger"
                        onClick={() => onRemoveMember(member)}
                      >
                        Remove
                      </button>
                    </span>
                  )}
                </div>
              ))}
            </div>
            <div className="isec">
              <h4>Invite link</h4>
              <LinkBox
                url={`chat.q9labs.ai/join/${group.inviteToken ?? ""}`}
                copied={linkCopied}
                onCopy={onCopyLink}
              />
              <p className="note">Anyone with the link can join and read the whole group.</p>
            </div>
            <div className="isec">
              <button type="button" className="irow danger" onClick={onLeave}>
                <Icon name="logout" />
                <span className="it">Leave group</span>
              </button>
            </div>
          </>
        )}
      </div>
      {notificationsOpen ? (
        <NotificationsPopover
          title={group.title}
          value={mode}
          anchor={notifyRow}
          onClose={() => onNotificationsOpenChange(false)}
          onChange={onNotifyChange}
        />
      ) : null}
    </>
  );
}
