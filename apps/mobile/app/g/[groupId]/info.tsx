import { type Id } from "@q9chat/convex";
import { useLocalSearchParams } from "expo-router";

import { GroupInfoJourney } from "../../../src/journey/GroupInfoJourney";

export default function InfoRoute() {
  const { groupId } = useLocalSearchParams<{ groupId: Id<"groups"> }>();
  return <GroupInfoJourney groupId={groupId} />;
}

export { BadGroupLink as ErrorBoundary } from "../../../src/journey/GroupUnavailable";
