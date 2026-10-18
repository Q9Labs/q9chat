import { surfaceOf, web } from "@e2e-dev/web";
import { expect } from "e2e";

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
