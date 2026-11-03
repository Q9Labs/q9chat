import { api } from "@q9chat/convex";
import { useQuery } from "convex/react";
import { useRouter } from "expo-router";
import { useEffect, useMemo } from "react";

import { useToast } from "../kit/useToast";
import { GroupsScreen } from "../screens/GroupsScreen";
import { config } from "../session/config";
import { groupRows, profileAvatar } from "./groupRows";
import { Loading } from "./Loading";
import { takeNotice } from "./notice";
import { usePhoneNotifications } from "./PhoneNotifications";
import { useOffline } from "./useOffline";
import type { ReadyProfile } from "./useStage";
import { useToday } from "./useToday";

/** The live groups list. */
export function GroupsJourney({ profile }: { profile: ReadyProfile }) {
  const router = useRouter();
  const push = usePhoneNotifications();
  const groups = useQuery(api.groups.list, {});
  const [toast, showToast] = useToast();
  useEffect(() => {
    const notice = takeNotice();
    if (notice) showToast(notice);
  }, [showToast]);
  const today = useToday();
  const offline = useOffline();
  const rows = useMemo(
    () => (groups ? groupRows(groups, config.siteUrl, today) : []),
    [groups, today],
  );
  // Until the first result arrives a spinner is right, unless the connection has been down for a while.
  if (groups === undefined && !offline) return <Loading />;
  return (
    <GroupsScreen
      me={profileAvatar(profile, config.siteUrl)}
      rows={groups === undefined ? null : rows}
      offline={offline}
      showPermissionBanner={push.banner}
      toast={toast ?? push.notice}
      onOpenGroup={(groupId) => router.push({ pathname: "/g/[groupId]", params: { groupId } })}
      onNewGroup={() => router.push("/new-group")}
      onAccount={() => router.push("/account")}
      onSearch={() => router.push("/search")}
      onNotNow={push.notNow}
      onTurnOn={push.turnOn}
    />
  );
}
