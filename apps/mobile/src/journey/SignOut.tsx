import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { sessionClient, useRevokeStatus } from "../session/client";

type SignOutApi = { complete: boolean; leave: () => void; clear: () => void };

const SignOutContext = createContext<SignOutApi | null>(null);

export function useSignOut(): SignOutApi {
  const api = useContext(SignOutContext);
  if (!api) throw new Error("useSignOut needs a SignOutProvider");
  return api;
}

/**
 * Signing out takes the person to Sign in at once. "Signed out" shows once the server confirms; until
 * then the session client keeps the revocation pending (its status is `useRevokeStatus`), so it survives
 * a failure, new sign-in attempts and a restart.
 */
export function SignOutProvider({ children }: { children: ReactNode }) {
  const [complete, setComplete] = useState(false);
  const revoke = useRevokeStatus();
  const latest = useRef(0);
  const leave = useCallback(() => {
    if (revoke === "revoking") return;
    const started = ++latest.current;
    setComplete(false);
    void sessionClient.signOut().then(
      () => {
        if (started === latest.current) setComplete(true);
      },
      () => {},
    );
  }, [revoke]);
  const clear = useCallback(() => {
    latest.current += 1;
    setComplete(false);
  }, []);
  const value = useMemo(() => ({ complete, leave, clear }), [complete, leave, clear]);
  return <SignOutContext.Provider value={value}>{children}</SignOutContext.Provider>;
}
