import { type Id } from "@q9chat/convex";
import { useLocalSearchParams } from "expo-router";

import { GroupJourney } from "../../../src/journey/GroupJourney";

export default function GroupRoute() {
  const { groupId } = useLocalSearchParams<{ groupId: Id<"groups"> }>();
  return <GroupJourney groupId={groupId} />;
}

export { BadGroupLink as ErrorBoundary } from "../../../src/journey/GroupUnavailable";
