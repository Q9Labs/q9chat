import { createFileRoute } from "@tanstack/react-router";

import { Journey } from "../../journey/journey.js";

export const Route = createFileRoute("/join/$token")({ component: JoinPage });

function JoinPage() {
  const { token } = Route.useParams();
  return <Journey authError={false} inviteToken={token} />;
}
