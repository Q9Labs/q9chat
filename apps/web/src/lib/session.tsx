import { Schema } from "effect";
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

import { Session } from "./auth/contracts.js";

async function post(path: string, body: object = {}) {
  return fetch(`/api/auth/${path}`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
async function readSession(response: Response) {
  if (!response.ok) throw new Error(response.status === 401 ? "invalid_code" : "auth_unavailable");
  return Schema.decodeUnknownSync(Session)(await response.json());
}
function useSessionState() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const current = useRef<Session | null>(null);
  const pending = useRef<Promise<string | null> | null>(null);
  const generation = useRef(0);
  const save = useCallback((value: Session | null) => {
    current.current = value;
    setSession(value);
  }, []);
  const fetchAccessToken = useCallback(
    ({ forceRefreshToken }: { forceRefreshToken: boolean }) => {
      const cached = current.current;
      if (!forceRefreshToken && cached && cached.expiresAt > Date.now() + 30_000)
        return Promise.resolve(cached.accessToken);
      if (pending.current) return pending.current;
      const started = generation.current;
      const refresh = async () => {
        const response = await post("token");
        if (response.status === 401) {
          if (started === generation.current) save(null);
          return null;
        }
        const next = await readSession(response);
        if (started !== generation.current) return null;
        save(next);
        return next.accessToken;
      };
      // Serialize refreshes across tabs too: every refresh rotates the shared cookie.
      pending.current = navigator.locks.request("q9-auth-refresh", refresh).finally(() => {
        pending.current = null;
        setLoading(false);
      });
      return pending.current;
    },
    [save],
  );
  useEffect(() => {
    void fetchAccessToken({ forceRefreshToken: false }).catch(() => {
      setLoading(false);
    });
  }, [fetchAccessToken]);
  const signOut = useCallback(async () => {
    generation.current += 1;
    await pending.current?.catch(() => null);
    const response = await post("sign-out");
    if (!response.ok) throw new Error("auth_unavailable");
    save(null);
  }, [save]);
  const startEmail = useCallback(async (email: string) => {
    const response = await post("email/start", { email });
    if (!response.ok) throw new Error("auth_unavailable");
  }, []);
  const verifyEmail = useCallback(
    async (email: string, code: string) => {
      generation.current += 1;
      await pending.current?.catch(() => null);
      const next = await readSession(await post("email/verify", { email, code, client: "web" }));
      save(next);
      setLoading(false);
    },
    [save],
  );
  return useMemo(
    () => ({
      status: loading
        ? ("loading" as const)
        : session
          ? ("authenticated" as const)
          : ("unauthenticated" as const),
      user: session?.user ?? null,
      method: session?.method ?? null,
      signOut,
      startEmail,
      verifyEmail,
      isLoading: loading,
      isAuthenticated: session !== null,
      fetchAccessToken,
    }),
    [loading, session, signOut, startEmail, verifyEmail, fetchAccessToken],
  );
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
