import { expect, type Screen } from "e2e";

/** Each named link is a press target of its own that is at least `minimum` tall (points on iOS, pixels on Android). */
export async function expectLinkHeights(screen: Screen, names: string[], minimum: number) {
  for (const name of names) {
    const height = (await screen.getByRole("link", name).boundingBox())?.height ?? 0;
    expect(height).toBeGreaterThanOrEqual(minimum);
  }
}
