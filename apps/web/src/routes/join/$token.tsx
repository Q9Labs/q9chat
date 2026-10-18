import { createFileRoute } from "@tanstack/react-router";

import { Journey } from "../../journey/journey.js";

export const Route = createFileRoute("/join/$token")({
  validateSearch: (search: { authError?: unknown }) => ({
    authError: search.authError === "1" || search.authError === 1 || search.authError === true,
  }),
  head: () => ({ meta: [{ name: "referrer", content: "no-referrer" }] }),
  component: JoinPage,
});

function JoinPage() {
  const { token } = Route.useParams();
  const { authError } = Route.useSearch();
  return <Journey authError={authError} inviteToken={token} />;
}
