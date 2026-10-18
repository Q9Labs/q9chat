import { useRouter } from "expo-router";
import { useState } from "react";
import { avatarOf, defaultWorld, rowsOf } from "../src/fixtures/build";
import { useToast } from "../src/kit/useToast";
import { GroupsScreen } from "../src/screens/GroupsScreen";

// Fixture data stands in until the wiring lane maps `groups.list` onto the same props.
const world = defaultWorld();

export default function GroupsRoute() {
  const router = useRouter();
  const [banner, setBanner] = useState(true);
  const [toast, showToast] = useToast();
  return (
    <GroupsScreen
      me={avatarOf("hasan")}
      rows={rowsOf(world, { unreadOn: true, removedGroupIds: [], removedBy: "shoaib" })}
      offline={false}
      showPermissionBanner={banner}
      toast={toast}
      onOpenGroup={(groupId) => router.push({ pathname: "/g/[groupId]", params: { groupId } })}
      onNewGroup={() => router.push("/new-group")}
      onAccount={() => router.push("/account")}
      onSearch={() => router.push("/search")}
      onNotNow={() => setBanner(false)}
      onTurnOn={() => {
        setBanner(false);
        showToast("Notifications are on");
      }}
    />
  );
}
