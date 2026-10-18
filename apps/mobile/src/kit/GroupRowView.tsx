import { View } from "react-native";
import { useTheme } from "../theme";
import { T } from "../theme/Text";
import { Avatar } from "./Avatar";
import { Icon } from "./Icon";
import { Press } from "./Press";
import type { GroupRow } from "../types";

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
      <T size={11} weight={700} lineHeight={11} tabular color={muted ? "mu" : "onAc"}>
        {children}
      </T>
    </View>
  );
}

const previewText = ({ by, summary }: { by: { name: string; isYou: boolean } | null; summary: string }) =>
  by === null ? summary : `${by.isYou ? "You" : by.name}: ${summary}`;

/** A group in the list: avatar, title and preview, time, mute bell, @ and unread badges. */
export function GroupRowView({ row, onPress }: { row: GroupRow; onPress: () => void }) {
  const removed = row.status === "removed";
  const muted = !removed && row.notify === "muted";
  const unread = !removed ? row.unreadCount : 0;
  const mentions = !removed && row.needsYou && unread > 0;
  const preview = removed ? `${row.removedBy} removed you` : previewText(row.preview);
  const label = `${row.title}${unread ? `, ${unread} unread` : ""}${mentions ? ", mentions you" : ""}${muted ? ", muted" : ""}`;
  return (
    <Press
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      scaleTo={1}
      style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, paddingHorizontal: 8, borderRadius: 12 }}
    >
      <Avatar avatar={row.avatar} size={48} />
      <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
        <T size={16} weight={600} numberOfLines={1}>
          {row.title}
        </T>
        <T size={14.5} color={unread && !muted ? "tx2" : "mu"} numberOfLines={1}>
          {preview}
        </T>
      </View>
      <View style={{ alignSelf: "stretch", alignItems: "flex-end", justifyContent: "center", gap: 4 }}>
        <T size={13} color="mu" tabular>
          {row.whenLabel}
        </T>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4, minHeight: 18 }}>
          {muted ? <Icon name="bellOff" size={14} color="mu" /> : null}
          {mentions ? (
            <Badge muted={muted} wide>
              @
            </Badge>
          ) : null}
          {unread ? <Badge muted={muted}>{unread > 99 ? "99+" : String(unread)}</Badge> : null}
        </View>
      </View>
    </Press>
  );
}
