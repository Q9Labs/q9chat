import { countLabel, previewLine, rowStamp } from "../chat/format.js";
import type { GroupListRow, Me } from "../chat/types.js";
import { Avatar } from "../ui/avatar.js";
import { Wordmark } from "../ui/brand.js";
import { Button } from "../ui/controls.js";
import { Icon } from "../ui/icons.js";
import { useRoot } from "../ui/root.js";

function rowLabel(row: GroupListRow): string {
  if (row.status === "removed") return `${row.title}, ${row.removedBy} removed you`;
  const unread = row.unreadCount > 0;
  return [
    row.title,
    unread ? `${countLabel(row.unreadCount)} unread` : null,
    unread && row.needsYou ? "mentions you" : null,
    row.notify === "muted" ? "muted" : null,
  ]
    .filter((part) => part !== null)
    .join(", ");
}

/** One group: avatar, name, last-message preview, date, unread count, @ badge and mute bell. */
export function GroupRowButton({
  row,
  selected,
  onSelect,
}: {
  readonly row: GroupListRow;
  readonly selected: boolean;
  readonly onSelect: () => void;
}) {
  const { clock } = useRoot();
  const member = row.status === "member" ? row : null;
  const muted = member?.notify === "muted";
  const unread = member !== null && member.unreadCount > 0;
  const loud = unread && !muted;
  return (
    <button
      type="button"
      className={`row${selected ? " sel" : ""}${loud ? " unread" : ""}`}
      aria-label={rowLabel(row)}
      aria-current={selected ? "true" : undefined}
      onClick={onSelect}
    >
      <Avatar avatar={row.avatar} />
      <span className="rt">
        <span className="ttl">{row.title}</span>
        <span className="pv">
          {row.status === "removed"
            ? `${row.removedBy} removed you`
            : previewLine(row.preview, row.kind)}
        </span>
      </span>
      <span className="meta">
        <span>
          {rowStamp(row.status === "removed" ? row.removedAt : row.lastActivityAt, clock)}
        </span>
        <span className="pills">
          {muted ? <Icon name="bellOff" /> : null}
          {unread && member.needsYou ? (
            <span className={`badge at${muted ? " qt" : ""}`}>@</span>
          ) : null}
          {unread ? (
            <span className={`badge${muted ? " qt" : ""}`}>{countLabel(member.unreadCount)}</span>
          ) : null}
        </span>
      </span>
    </button>
  );
}

interface SidebarProps {
  readonly me: Me;
  readonly rows: readonly GroupListRow[];
  readonly selectedGroupId: string | null;
  readonly onSelect: (groupId: string) => void;
  readonly onNewGroup: () => void;
  readonly onSearch: () => void;
  readonly onAccount: () => void;
}

/** The persistent left column: wordmark, new group, search, your groups, your account. */
export function Sidebar({
  me,
  rows,
  selectedGroupId,
  onSelect,
  onNewGroup,
  onSearch,
  onAccount,
}: SidebarProps) {
  return (
    <aside className="side" aria-label="Groups">
      <div className="stop">
        <Wordmark />
        <button
          type="button"
          className="newg"
          aria-label="New group"
          data-tip="New group"
          onClick={onNewGroup}
        >
          <Icon name="plus" />
        </button>
      </div>
      <button type="button" className="sbox" onClick={onSearch}>
        <Icon name="search" />
        <span>Search</span>
        <kbd>⌘K</kbd>
      </button>
      <nav className="list" aria-label="Your groups">
        {rows.length === 0 ? (
          <p className="note" style={{ padding: "8px 10px" }}>
            Your groups show up here.
          </p>
        ) : (
          rows.map((row) => (
            <GroupRowButton
              key={row.groupId}
              row={row}
              selected={row.groupId === selectedGroupId}
              onSelect={() => onSelect(row.groupId)}
            />
          ))
        )}
      </nav>
      <div className="sfoot">
        <button type="button" className="mebtn" aria-label="Account" onClick={onAccount}>
          <Avatar avatar={me.avatar} size="sm" />
          <span>
            <b>{me.displayName}</b>
            <small>{me.email}</small>
          </span>
        </button>
      </div>
    </aside>
  );
}

/** First-run prompt to allow desktop notifications. */
export function PermissionBanner({
  onLater,
  onTurnOn,
}: {
  readonly onLater: () => void;
  readonly onTurnOn: () => void;
}) {
  return (
    <section className="fbanner" aria-label="Turn on notifications">
      <Icon name="bell" />
      <span>Turn on desktop notifications to hear about mentions and replies.</span>
      <Button onClick={onLater}>Not now</Button>
      <Button variant="solid" onClick={onTurnOn}>
        Turn on
      </Button>
    </section>
  );
}

/** The main pane when you have no groups yet. */
export function NoGroupsYet({ onNewGroup }: { readonly onNewGroup: () => void }) {
  return (
    <div className="center">
      <span className="ebadge">
        <Icon name="users" />
      </span>
      <h2>No groups yet</h2>
      <p>Start a group and add people by email, or open an invite link someone sent you.</p>
      <div className="acts2">
        <Button variant="solid" icon="plus" onClick={onNewGroup}>
          New group
        </Button>
      </div>
    </div>
  );
}
