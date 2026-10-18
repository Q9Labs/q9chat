/// <reference types="vite/client" />
import "@fontsource-variable/geist/index.css";
import "@fontsource-variable/geist-mono/index.css";
import "@q9labsai/ui/tokens.css";
import { ThemeProvider } from "@q9labsai/ui";
import { createRootRoute, Outlet } from "@tanstack/react-router";
import { ConvexProviderWithAuth } from "convex/react";

import { RootDocument } from "../components/root-document.js";
import { convexClient } from "../lib/convex.js";
import { SessionProvider, useSession } from "../lib/session.js";

import "../styles.css";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Q9 Chat" },
      { name: "application-name", content: "Q9 Chat" },
      { name: "description", content: "A calm, fast, reliable team chat." },
    ],
  }),
  shellComponent: RootDocument,
  component: RootComponent,
});

function RootComponent() {
  return (
    <SessionProvider>
      {/* oxlint-disable-next-line react/rules-of-hooks -- intentional: ConvexProviderWithAuth takes the auth hook and calls it as a hook itself. */}
      <ConvexProviderWithAuth client={convexClient} useAuth={useSession}>
        <ThemeProvider defaultProductTheme="q9chat">
          <Outlet />
        </ThemeProvider>
      </ConvexProviderWithAuth>
    </SessionProvider>
  );
}
