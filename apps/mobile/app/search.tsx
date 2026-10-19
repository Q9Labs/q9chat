import { type Id } from "@q9chat/convex";
import { useLocalSearchParams } from "expo-router";

import { SearchJourney } from "../src/journey/SearchJourney";

export default function SearchRoute() {
  const { groupId } = useLocalSearchParams<{ groupId?: Id<"groups"> }>();
  return <SearchJourney groupId={groupId} />;
}
