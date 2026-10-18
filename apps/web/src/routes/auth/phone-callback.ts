import { createFileRoute } from "@tanstack/react-router";

import { phoneCallback } from "../../lib/auth/oauth.server.js";

export const Route = createFileRoute("/auth/phone-callback")({
  server: { handlers: { GET: ({ request }) => phoneCallback(request) } },
});
