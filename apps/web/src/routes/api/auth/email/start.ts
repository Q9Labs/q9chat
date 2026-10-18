import { createFileRoute } from "@tanstack/react-router";

import { emailStart } from "../../../../lib/auth/handlers.server.js";

export const Route = createFileRoute("/api/auth/email/start")({
  server: { handlers: { POST: ({ request }) => emailStart(request) } },
});
