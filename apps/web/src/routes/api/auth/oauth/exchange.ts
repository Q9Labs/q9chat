import { createFileRoute } from "@tanstack/react-router";

import { oauthExchange } from "../../../../lib/auth/oauth.server.js";

export const Route = createFileRoute("/api/auth/oauth/exchange")({
  server: { handlers: { POST: ({ request }) => oauthExchange(request) } },
});
