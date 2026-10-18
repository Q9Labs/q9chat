import { createFileRoute } from "@tanstack/react-router";

import { emailVerify } from "../../../../lib/auth/handlers.server.js";

export const Route = createFileRoute("/api/auth/email/verify")({
  server: { handlers: { POST: ({ request }) => emailVerify(request) } },
});
