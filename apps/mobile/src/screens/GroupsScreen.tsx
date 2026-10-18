import { useCallback } from "react";
import { FlatList, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PillButton } from "../kit/Buttons";
import {
  CenterState,
  GroupsTop,
  OfflinePill,
  PermissionBanner,
  Screen,
  SearchBox,
} from "../kit/Chrome";
import { GroupRowView } from "../kit/GroupRowView";
import { Toast } from "../kit/Overlays";
import type { Avatar, GroupRow } from "../types";

export type GroupsScreenProps = {
  me: Avatar;
  rows: readonly GroupRow[];
  offline: boolean;
  /** Shown until the person answers; the OS permission dialog is the system's own. */
  showPermissionBanner: boolean;
  toast: string | null;
  onOpenGroup: (groupId: string) => void;
  onNewGroup: () => void;
  onAccount: () => void;
  onSearch: () => void;
  onNotNow: () => void;
  onTurnOn: () => void;
};

function GroupItem({
  row,
  onOpenGroup,
}: {
  row: GroupRow;
  onOpenGroup: (groupId: string) => void;
}) {
  return <GroupRowView row={row} onPress={() => onOpenGroup(row.groupId)} />;
}

/** The phone home: wordmark, search, optional banners, then the groups newest first. */
export function GroupsScreen(props: GroupsScreenProps) {
  const insets = useSafeAreaInsets();
  const { onOpenGroup } = props;
  const renderRow = useCallback(
    ({ item }: { item: GroupRow }) => <GroupItem row={item} onOpenGroup={onOpenGroup} />,
    [onOpenGroup],
  );
  return (
    <Screen>
      <GroupsTop me={props.me} onNewGroup={props.onNewGroup} onAccount={props.onAccount} />
      {props.offline ? <OfflinePill /> : null}
      <SearchBox onPress={props.onSearch} />
      {props.showPermissionBanner ? (
        <PermissionBanner onNotNow={props.onNotNow} onTurnOn={props.onTurnOn} />
      ) : null}
      {props.rows.length ? (
        <FlatList
          accessibilityLabel="Your groups"
          data={props.rows}
          keyExtractor={(row) => row.groupId}
          contentContainerStyle={{ paddingHorizontal: 8 }}
          renderItem={renderRow}
          ListFooterComponent={<View style={{ height: Math.max(insets.bottom, 8) }} />}
        />
      ) : (
        <CenterState
          icon="users"
          title="No groups yet"
          text="Start a group and add people by email, or open an invite link someone sent you."
          action={
            <PillButton label="New group" icon="plus" variant="solid" onPress={props.onNewGroup} />
          }
        />
      )}
      {props.toast ? <Toast text={props.toast} /> : null}
    </Screen>
  );
}
