import { createFileRoute } from "@tanstack/react-router";

import { oauthStart } from "../../../../lib/auth/oauth.server.js";

export const Route = createFileRoute("/api/auth/oauth/$provider")({
  server: { handlers: { GET: ({ request, params }) => oauthStart(request, params.provider) } },
});
