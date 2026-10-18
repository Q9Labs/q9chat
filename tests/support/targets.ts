import { expect, type Screen } from "e2e";

/** Each named button is a press target of its own that is at least `minimum` tall (points on iOS, pixels on Android). */
export async function expectButtonHeights(screen: Screen, names: string[], minimum: number) {
  for (const name of names) {
    const height = (await screen.getByRole("button", name).boundingBox())?.height ?? 0;
    // Layout floats drift by a hair (44 comes back as 43.99999999999994), so the bound has a rounding allowance.
    expect(height).toBeGreaterThanOrEqual(minimum - 0.01);
  }
}
