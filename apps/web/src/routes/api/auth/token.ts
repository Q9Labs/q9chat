import { createFileRoute } from "@tanstack/react-router";

import { token } from "../../../lib/auth/handlers.server.js";

export const Route = createFileRoute("/api/auth/token")({
  server: { handlers: { POST: ({ request }) => token(request) } },
});
