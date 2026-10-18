import { createFileRoute } from "@tanstack/react-router";

import { signOut } from "../../../lib/auth/handlers.server.js";

export const Route = createFileRoute("/api/auth/sign-out")({
  server: { handlers: { POST: ({ request }) => signOut(request) } },
});
