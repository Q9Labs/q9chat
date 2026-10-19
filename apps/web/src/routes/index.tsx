import { createFileRoute } from "@tanstack/react-router";

import { Journey } from "../journey/journey.js";

export const Route = createFileRoute("/")({
  validateSearch: (search: { authError?: unknown; group?: unknown; message?: unknown }) => ({
    message:
      Number.isSafeInteger(Number(search.message)) && Number(search.message) > 0
        ? Number(search.message)
        : undefined,
    group: typeof search.group === "string" ? search.group : undefined,
    authError:
      search.authError === "1" || search.authError === 1 || search.authError === true
        ? true
        : undefined,
  }),
  component: HomePage,
});

function HomePage() {
  const { authError } = Route.useSearch();
  return <Journey authError={authError === true} />;
}
