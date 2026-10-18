import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { sessionClient } from "../session/client";

type SignOutStatus = "idle" | "pending" | "complete" | "failed";
type SignOutApi = { status: SignOutStatus; leave: () => void; clear: () => void };

const SignOutContext = createContext<SignOutApi | null>(null);

export function useSignOut(): SignOutApi {
  const api = useContext(SignOutContext);
  if (!api) throw new Error("useSignOut needs a SignOutProvider");
  return api;
}

/**
 * Signing out takes the person to Sign in at once; "Signed out" appears only after the server
 * confirms, and "Couldn't sign out" with a retry when it does not. The status outlives the screens.
 */
export function SignOutProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SignOutStatus>("idle");
  const generation = useRef(0);
  const leave = useCallback(() => {
    if (status === "pending") return;
    const started = ++generation.current;
    setStatus("pending");
    void sessionClient.signOut().then(
      () => {
        if (started === generation.current) setStatus("complete");
      },
      () => {
        if (started === generation.current) setStatus("failed");
      },
    );
  }, [status]);
  const clear = useCallback(() => {
    generation.current += 1;
    setStatus("idle");
  }, []);
  const value = useMemo(() => ({ status, leave, clear }), [status, leave, clear]);
  return <SignOutContext.Provider value={value}>{children}</SignOutContext.Provider>;
}
