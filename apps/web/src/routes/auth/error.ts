import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/auth/error")({
  server: {
    handlers: {
      GET: () =>
        new Response(null, {
          status: 302,
          headers: { Location: "/?authError=1", "Cache-Control": "no-store" },
        }),
    },
  },
});
