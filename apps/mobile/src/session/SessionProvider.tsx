import { ConvexProviderWithAuth, ConvexReactClient } from "convex/react";
import { useEffect, useMemo, type ReactNode } from "react";
import { AppState } from "react-native";

import { sessionClient, useSessionState } from "./client";
import { config } from "./config";

const convex = new ConvexReactClient(config.convexUrl, { unsavedChangesWarning: false });

function useConvexSession() {
  const { status } = useSessionState();
  return useMemo(
    () => ({
      isLoading: status === "loading",
      isAuthenticated: status === "authenticated",
      fetchAccessToken: sessionClient.fetchAccessToken,
    }),
    [status],
  );
}

/** Restores the saved session once, then feeds Convex its tokens from it. */
export function SessionProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    void sessionClient.bootstrap();
    // Coming back to the app is the moment a lost connection may have returned.
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "active") void sessionClient.retry();
    });
    return () => subscription.remove();
  }, []);
  return (
    <ConvexProviderWithAuth
      client={convex}
      // oxlint-disable-next-line react/hooks -- Convex's provider takes its auth hook as a prop and calls it itself
      useAuth={useConvexSession}
    >
      {children}
    </ConvexProviderWithAuth>
  );
}
