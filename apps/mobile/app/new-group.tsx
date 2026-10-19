import { Redirect } from "expo-router";

import { NewGroupJourney } from "../src/journey/NewGroupJourney";
import { useStage } from "../src/journey/useStage";

export default function NewGroupRoute() {
  const stage = useStage();
  if (stage.kind !== "ready") return <Redirect href="/" />;
  return <NewGroupJourney profile={stage.profile} />;
}
