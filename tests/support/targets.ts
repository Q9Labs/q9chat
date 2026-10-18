import { expect, type Screen } from "e2e";

/** Each named link (Android exposes the pressable as a "group") is a press target of its own that is at least `minimum` tall (points on iOS, pixels on Android). */
export async function expectLinkHeights(
  screen: Screen,
  names: string[],
  minimum: number,
  role: "link" | "group" = "link",
) {
  for (const name of names) {
    const height = (await screen.getByRole(role, name).boundingBox())?.height ?? 0;
    // Layout floats drift by a hair (44 comes back as 43.99999999999994), so the bound has a rounding allowance.
    expect(height).toBeGreaterThanOrEqual(minimum - 0.01);
  }
}
