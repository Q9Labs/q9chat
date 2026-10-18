import { Redirect } from "expo-router";

import { AccountJourney } from "../src/journey/AccountJourney";
import { useStage } from "../src/journey/useStage";

export default function AccountRoute() {
  const stage = useStage();
  if (stage.kind !== "ready") return <Redirect href="/" />;
  return <AccountJourney profile={stage.profile} method={stage.session.method} />;
}
