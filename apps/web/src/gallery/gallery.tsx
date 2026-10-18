import { getRouteApi, Link } from "@tanstack/react-router";

import { Frame } from "./scene.js";
import { STATES } from "./states.js";

const route = getRouteApi("/gallery");

/**
 * Dev-only: every screen and state with fixture data, drawn at the mock's
 * 1280 by 800 so each can be shot next to the mock. `?state=<id>&theme=<light|dark>`.
 */
export function Gallery() {
  const { state, theme } = route.useSearch();
  const current = STATES.find((entry) => entry.id === state);
  if (current !== undefined) {
    return <Frame theme={theme}>{current.render()}</Frame>;
  }
  return (
    <main style={{ padding: 24, fontFamily: "'Figtree Variable', sans-serif" }}>
      <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 12 }}>Q9 Chat gallery</h1>
      <ul style={{ columnWidth: 280, lineHeight: 1.8 }}>
        {STATES.map((entry) => (
          <li key={entry.id}>
            <Link to="/gallery" search={{ state: entry.id, theme: "light" }}>
              {entry.title}
            </Link>{" "}
            <Link to="/gallery" search={{ state: entry.id, theme: "dark" }}>
              (dark)
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
