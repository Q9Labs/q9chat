import { View } from "react-native";

import { useTheme } from "../theme";
import { T } from "../theme/Text";
import type { GroupRow } from "../types";
import { Avatar } from "./Avatar";
import { Icon } from "./Icon";
import { Press } from "./Press";

function Badge({ children, muted, wide }: { children: string; muted: boolean; wide?: boolean }) {
  const { c } = useTheme();
  return (
    <View
      style={{
        minWidth: 18,
        height: 18,
        paddingHorizontal: wide ? 0 : 5,
        width: wide ? 18 : undefined,
        borderRadius: 999,
        backgroundColor: muted ? c.s2 : c.ac,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <T size={11} weight={700} lineHeight={11} tabular capped color={muted ? "mu" : "onAc"}>
        {children}
      </T>
    </View>
  );
}

const previewText = ({
  by,
  summary,
}: {
  by: { name: string; isYou: boolean } | null;
  summary: string;
}) => (by === null ? summary : `${by.isYou ? "You" : by.name}: ${summary}`);

type RowFacts = {
  muted: boolean;
  unread: number;
  mentions: boolean;
  removed: boolean;
  preview: string;
};

const factsOf = (row: GroupRow): RowFacts => {
  if (row.status === "removed")
    return {
      muted: false,
      unread: 0,
      mentions: false,
      removed: true,
      preview: `${row.removedBy} removed you`,
    };
  return {
    muted: row.notify === "muted",
    unread: row.unreadCount,
    mentions: row.needsYou && row.unreadCount > 0,
    removed: false,
    preview: previewText(row.preview),
  };
};

const labelOf = (title: string, { unread, mentions, muted, removed, preview }: RowFacts) =>
  [
    title,
    removed ? preview : null,
    unread ? `${unread} unread` : null,
    mentions ? "mentions you" : null,
    muted ? "muted" : null,
  ]
    .filter(Boolean)
    .join(", ");

/** The mute bell, the @ badge and the unread count. */
function Badges({ facts }: { facts: RowFacts }) {
  const { muted, mentions, unread } = facts;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, minHeight: 18 }}>
      {muted ? <Icon name="bellOff" size={14} color="mu" /> : null}
      {mentions ? (
        <Badge muted={muted} wide>
          @
        </Badge>
      ) : null}
      {unread ? <Badge muted={muted}>{unread > 99 ? "99+" : String(unread)}</Badge> : null}
    </View>
  );
}

/** A group in the list: avatar, title and preview, time, mute bell, @ and unread badges. */
export function GroupRowView({ row, onPress }: { row: GroupRow; onPress: () => void }) {
  const facts = factsOf(row);
  return (
    <Press
      accessibilityRole="button"
      accessibilityLabel={labelOf(row.title, facts)}
      onPress={onPress}
      scaleTo={1}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingVertical: 10,
        paddingHorizontal: 8,
        borderRadius: 12,
      }}
    >
      <Avatar avatar={row.avatar} size={48} />
      <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
        <T size={16} weight={600} numberOfLines={1}>
          {row.title}
        </T>
        <T size={14.5} color={facts.unread && !facts.muted ? "tx2" : "mu"} numberOfLines={1}>
          {facts.preview}
        </T>
      </View>
      <View
        style={{ alignSelf: "stretch", alignItems: "flex-end", justifyContent: "center", gap: 4 }}
      >
        <T size={13} color="mu" tabular>
          {row.whenLabel}
        </T>
        <Badges facts={facts} />
      </View>
    </Press>
  );
}
