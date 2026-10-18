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

type SignOutApi = {
  complete: boolean;
  /** This account's sign-out is under way: the session is already gone, the server has not confirmed. */
  signingOut: boolean;
  leave: () => void;
  clear: () => void;
};

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
  const [signingOut, setSigningOut] = useState(false);
  const latest = useRef(0);
  // Only a second tap on a sign-out already under way is dropped. An older revoke still waiting on the
  // server does not stop this one: the session client queues it behind that revoke.
  const leave = useCallback(() => {
    if (signingOut) return;
    const started = ++latest.current;
    setComplete(false);
    setSigningOut(true);
    void sessionClient
      .signOut()
      .then(
        () => {
          if (started === latest.current) setComplete(true);
        },
        () => {},
      )
      .finally(() => setSigningOut(false));
  }, [signingOut]);
  const clear = useCallback(() => {
    latest.current += 1;
    setComplete(false);
  }, []);
  const value = useMemo(
    () => ({ complete, signingOut, leave, clear }),
    [complete, signingOut, leave, clear],
  );
  return <SignOutContext.Provider value={value}>{children}</SignOutContext.Provider>;
}
