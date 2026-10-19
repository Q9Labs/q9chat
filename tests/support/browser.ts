import { surfaceOf, web } from "@e2e-dev/web";
import { api } from "@q9chat/convex";
import { ConvexHttpClient } from "convex/browser";
import { expect } from "e2e";
import { Schema } from "effect";

import { Session } from "../../apps/web/src/lib/auth/contracts.js";
import { magicCode } from "./workos.js";

export const browserEngine = web();

export async function signInDevAccount(
  context: ReturnType<NonNullable<ReturnType<typeof surfaceOf>>["context"]>,
  email: string,
  displayName: string,
) {
  const origin = "http://localhost:3000";
  const headers = { Origin: origin };
  expect(
    (
      await context.request.post(`${origin}/api/auth/email/start`, { headers, data: { email } })
    ).status(),
  ).toBe(200);
  expect(
    (
      await context.request.post(`${origin}/api/auth/email/verify`, {
        headers,
        data: { email, code: await magicCode(email), client: "web" },
      })
    ).status(),
  ).toBe(200);
  const client = await devClient(context);
  const id = await client.action(api.profiles.setUp, { displayName });
  return { client, id };
}

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
  client = new ConvexHttpClient("https://quixotic-crab-23.convex.cloud"),
) {
  const response = await context.request.post("http://localhost:3000/api/auth/token", {
    headers: { Origin: "http://localhost:3000" },
    data: {},
  });
  expect(response.status()).toBe(200);
  const session = Schema.decodeUnknownSync(Session)(await response.json());
  client.setAuth(session.accessToken);
  return client;
}
