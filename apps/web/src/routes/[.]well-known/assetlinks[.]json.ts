import { createFileRoute } from "@tanstack/react-router";

import { assetLinks, wellKnownResponse } from "../../lib/app-links.js";

export const Route = createFileRoute("/.well-known/assetlinks.json")({
  server: { handlers: { GET: () => wellKnownResponse(assetLinks) } },
});
