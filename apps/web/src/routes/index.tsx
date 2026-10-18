import { createFileRoute } from "@tanstack/react-router";

import { Journey } from "../journey/journey.js";

export const Route = createFileRoute("/")({
  validateSearch: (search: { authError?: unknown; signedIn?: unknown }) => ({
    authError:
      search.authError === "1" || search.authError === 1 || search.authError === true
        ? true
        : undefined,
    signedIn:
      search.signedIn === "1" || search.signedIn === 1 || search.signedIn === true
        ? true
        : undefined,
  }),
  component: HomePage,
});

function HomePage() {
  const { authError, signedIn } = Route.useSearch();
  return <Journey authError={authError === true} oauthArrival={signedIn === true} />;
}
