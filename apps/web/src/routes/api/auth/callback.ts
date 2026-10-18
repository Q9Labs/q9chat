import { createFileRoute } from "@tanstack/react-router";

import { oauthCallback } from "../../../lib/auth/oauth.server.js";

export const Route = createFileRoute("/api/auth/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const response = await oauthCallback(request);
        const location = response.headers.get("Location");
        if (
          location &&
          response.headers.getSetCookie().some((value) => value.startsWith("q9_session="))
        ) {
          const destination = new URL(location, request.url);
          destination.searchParams.set("signedIn", "1");
          response.headers.set("Location", destination.href);
        }
        return response;
      },
    },
  },
});
