import { type Id } from "@q9chat/convex";
import { useLocalSearchParams } from "expo-router";

import { GroupJourney } from "../../../src/journey/GroupJourney";
import { searchSequence } from "../../../src/journey/searchRules";

export default function GroupRoute() {
  const { groupId, m, jump } = useLocalSearchParams<{
    groupId: Id<"groups">;
    m?: string;
    jump?: string;
  }>();
  return (
    <GroupJourney
      key={`${groupId}:${m ?? ""}:${jump ?? ""}`}
      groupId={groupId}
      target={searchSequence(m)}
    />
  );
}

export { BadGroupLink as ErrorBoundary } from "../../../src/journey/GroupUnavailable";
