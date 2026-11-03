import { api } from "@q9chat/convex";
import { useConvexAuth, useQuery } from "convex/react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { View } from "react-native";

import { Toast } from "../kit/Overlays";
import { useToast } from "../kit/useToast";
import { sessionClient } from "../session/client";
import { usePhoneNotifications } from "./PhoneNotifications";
import { rememberTextProfile, retainGroupText } from "./textStore";

type SignOutApi = {
  complete: boolean;
  /** The keychain step of a sign-out is under way. */
  signingOut: boolean;
  leave: () => void;
  clear: () => void;
};

const SignOutContext = createContext<SignOutApi | null>(null);

export function useSignOut(): SignOutApi {
  const context = useContext(SignOutContext);
  if (!context) throw new Error("useSignOut needs a SignOutProvider");
  return context;
}

/**
 * Signing out takes the person to Sign in as soon as the phone has forgotten the session, and "Signed
 * out" shows there. When the phone cannot forget it, they stay signed in and a toast says so.
 */
export function SignOutProvider({ children }: { children: ReactNode }) {
  const push = usePhoneNotifications();
  const { isAuthenticated } = useConvexAuth();
  const me = useQuery(api.profiles.me, isAuthenticated ? {} : "skip");
  const groups = useQuery(api.groups.list, me?.status === "ready" ? {} : "skip");
  useEffect(() => {
    if (me?.status !== "ready") return;
    rememberTextProfile(me.profile.id);
    // An absent membership also means a leave on another device or before this restart.
    if (groups !== undefined)
      retainGroupText(
        me.profile.id,
        groups.filter((group) => group.status === "member").map((group) => group.groupId),
      );
  }, [me, groups]);
  const [complete, setComplete] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [toast, showToast] = useToast();
  const latest = useRef(0);
  const leave = useCallback(() => {
    if (signingOut) return;
    const started = ++latest.current;
    setComplete(false);
    setSigningOut(true);
    void push
      .unregister()
      .then(() => sessionClient.signOut())
      .then(
        () => {
          if (started === latest.current) setComplete(true);
        },
        () => {
          push.resume();
          showToast("Couldn't sign out. Connect and try again.");
        },
      )
      .finally(() => setSigningOut(false));
  }, [signingOut, showToast, push]);
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
