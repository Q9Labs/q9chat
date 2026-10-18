/// <reference types="vite/client" />
import "@fontsource-variable/figtree/index.css";
import "@q9labsai/ui/tokens.css";
import { ThemeProvider } from "@q9labsai/ui";
import { createRootRoute, Outlet } from "@tanstack/react-router";
import { AuthKitProvider } from "@workos-inc/authkit-react";
import { ConvexProviderWithAuth } from "convex/react";

import { RootDocument } from "../components/root-document.js";
import { convexClient, useWorkosAuthForConvex, workosClientId } from "../lib/convex.js";

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
    <AuthKitProvider clientId={workosClientId}>
      {/* oxlint-disable-next-line react/rules-of-hooks -- intentional: ConvexProviderWithAuth takes the auth hook and calls it as a hook itself. */}
      <ConvexProviderWithAuth client={convexClient} useAuth={useWorkosAuthForConvex}>
        <ThemeProvider defaultProductTheme="q9chat">
          <Outlet />
        </ThemeProvider>
      </ConvexProviderWithAuth>
    </AuthKitProvider>
  );
}
