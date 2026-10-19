import { useLocalSearchParams } from "expo-router";

import { Journey } from "../../src/journey/Journey";

/** q9chat://join/<token> and https://chat.q9labs.ai/join/<token>. Open to everyone: signing in comes first. */
export default function JoinRoute() {
  const { token } = useLocalSearchParams<{ token: string }>();
  return <Journey invite={token} />;
}
