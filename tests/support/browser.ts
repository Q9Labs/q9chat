import { surfaceOf, web } from "@e2e-dev/web";
import { ConvexHttpClient } from "convex/browser";
import { expect } from "e2e";
import { Schema } from "effect";

import { Session } from "../../apps/web/src/lib/auth/contracts.js";

export const browserEngine = web();

export async function expectMainFullWidth() {
  const surface = surfaceOf(browserEngine);
  if (!surface) throw new Error("Missing live browser surface");
  expect(await surface.page().locator(".info").count()).toBe(0);
  const edges = await surface
    .page()
    .locator("main.main")
    .evaluate((pane) => ({
      right: pane.getBoundingClientRect().right,
      viewport: window.innerWidth,
    }));
  expect(edges.right).toBe(edges.viewport);
}

/** Public web-session exchange for the genuine dev backend, shared by journey fixtures. */
export async function devClient(
  context: ReturnType<NonNullable<ReturnType<typeof surfaceOf>>["context"]>,
) {
  const response = await context.request.post("http://localhost:3000/api/auth/token", {
    headers: { Origin: "http://localhost:3000" },
    data: {},
  });
  expect(response.status()).toBe(200);
  const session = Schema.decodeUnknownSync(Session)(await response.json());
  const client = new ConvexHttpClient("https://quixotic-crab-23.convex.cloud");
  client.setAuth(session.accessToken);
  return client;
}
