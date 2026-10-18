import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import { createSessionClient } from "./session-client.js";

export { EmailVerificationError } from "./session-client.js";

function useSessionState() {
  const [client] = useState(createSessionClient);
  const { session, loading } = useSyncExternalStore(
    client.subscribe,
    client.getSnapshot,
    client.getServerSnapshot,
  );
  useEffect(() => client.start(), [client]);
  return {
    status: loading
      ? ("loading" as const)
      : session
        ? ("authenticated" as const)
        : ("unauthenticated" as const),
    user: session?.user ?? null,
    method: session?.method ?? null,
    signOut: client.signOut,
    startEmail: client.startEmail,
    verifyEmail: client.verifyEmail,
    isLoading: loading,
    isAuthenticated: session !== null,
    fetchAccessToken: client.fetchAccessToken,
  };
}
const SessionContext = createContext<ReturnType<typeof useSessionState> | null>(null);
export function SessionProvider({ children }: { children: ReactNode }) {
  const value = useSessionState();
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
export function useSession() {
  const session = useContext(SessionContext);
  if (!session) throw new Error("useSession requires SessionProvider");
  return session;
}
