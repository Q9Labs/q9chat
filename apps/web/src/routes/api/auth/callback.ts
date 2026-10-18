import { createFileRoute } from "@tanstack/react-router";

import { oauthCallback } from "../../../lib/auth/oauth.server.js";

export const Route = createFileRoute("/api/auth/callback")({
  server: { handlers: { GET: ({ request }) => oauthCallback(request) } },
});
