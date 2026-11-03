import { createFileRoute } from "@tanstack/react-router";

import { appleAppSiteAssociation, wellKnownResponse } from "../../lib/app-links.js";

export const Route = createFileRoute("/.well-known/apple-app-site-association")({
  server: { handlers: { GET: () => wellKnownResponse(appleAppSiteAssociation) } },
});
