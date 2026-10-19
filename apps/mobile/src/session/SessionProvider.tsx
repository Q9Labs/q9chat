import { ConvexProviderWithAuth, ConvexReactClient } from "convex/react";
import { useEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { AppState } from "react-native";

import { sessionClient, useSessionState } from "./client";
import { config } from "./config";
import { createClientHolder } from "./convexClients";

const newConvexClient = () =>
  new ConvexReactClient(config.convexUrl, { unsavedChangesWarning: false });

const clients = createClientHolder(newConvexClient);

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
  const epoch = useSyncExternalStore(sessionClient.subscribe, sessionClient.epoch);
  const client = clients.clientFor(epoch);
  // Convex's provider clears the old client's auth in its own effect cleanup, which runs before this effect; a client closed any earlier throws there.
  useEffect(() => {
    clients.closeRetired();
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- the effect runs when the client is replaced, so it reads no value from it
  }, [client]);
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
      client={client}
      // oxlint-disable-next-line react/hooks -- Convex's provider takes its auth hook as a prop and calls it itself
      useAuth={useConvexSession}
    >
      {children}
    </ConvexProviderWithAuth>
  );
}
