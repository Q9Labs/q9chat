import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { View } from "react-native";

import { Toast } from "../kit/Overlays";
import { useToast } from "../kit/useToast";
import { sessionClient } from "../session/client";

type SignOutApi = {
  complete: boolean;
  /** The keychain step of a sign-out is under way. */
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
 * Signing out takes the person to Sign in as soon as the phone has forgotten the session, and "Signed
 * out" shows there. When the phone cannot forget it, they stay signed in and a toast says so.
 */
export function SignOutProvider({ children }: { children: ReactNode }) {
  const [complete, setComplete] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [toast, showToast] = useToast();
  const latest = useRef(0);
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
        () => showToast("Couldn't sign out. Try again."),
      )
      .finally(() => setSigningOut(false));
  }, [signingOut, showToast]);
  const clear = useCallback(() => {
    latest.current += 1;
    setComplete(false);
  }, []);
  const value = useMemo(
    () => ({ complete, signingOut, leave, clear }),
    [complete, signingOut, leave, clear],
  );
  return (
    <SignOutContext.Provider value={value}>
      <View style={{ flex: 1 }}>
        {children}
        {toast ? <Toast text={toast} /> : null}
      </View>
    </SignOutContext.Provider>
  );
}
