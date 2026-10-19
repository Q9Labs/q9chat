import { Either, Schema } from "effect";

import { Session } from "./auth/contracts.js";

const empty = { session: null, loading: true };
type Snapshot = { session: Session | null; loading: boolean };
async function post(path: string, body: object = {}, keepalive = false) {
  return fetch(`/api/auth/${path}`, {
    method: "POST",
    keepalive,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
const VerificationFailure = Schema.Struct({
  error: Schema.Literal("invalid_code", "invalid_transaction"),
});
export class EmailVerificationError extends Error {
  readonly code: typeof VerificationFailure.Type.error;
  constructor(code: typeof VerificationFailure.Type.error) {
    super(
      code === "invalid_transaction"
        ? "That code has expired. Send a new one."
        : "That code didn't work. Check it and try again.",
    );
    this.name = "EmailVerificationError";
    this.code = code;
  }
}
async function readSession(response: Response) {
  if (!response.ok) {
    if (response.status === 401) {
      const failure = Schema.decodeUnknownEither(VerificationFailure)(await response.json());
      if (Either.isRight(failure)) throw new EmailVerificationError(failure.right.error);
    }
    throw new Error("auth_unavailable");
  }
  return Schema.decodeUnknownSync(Session)(await response.json());
}

export function createSessionClient(
  retireTransport: () => Promise<void> = () => Promise.resolve(),
) {
  let snapshot: Snapshot = empty;
  let generation = 0;
  let pending: Promise<string | null> | null = null;
  let logout: Promise<void> | null = null;
  let channel: BroadcastChannel | null = null;
  const listeners = new Set<() => void>();
  const notify = (userId: string | null) => {
    // eslint-disable-next-line unicorn/require-post-message-target-origin -- false positive: BroadcastChannel is same-origin and has no targetOrigin argument.
    channel?.postMessage({ userId });
  };
  const save = async (session: Session | null) => {
    if (logout) return false;
    const started = generation;
    const changed = snapshot.loading || snapshot.session?.user.id !== session?.user.id;
    if (changed) await retireTransport();
    if (started !== generation) return false;
    snapshot = { session, loading: false };
    if (changed) notify(session?.user.id ?? null);
    for (const listener of listeners) listener();
    return true;
  };
  const fetchAccessToken = ({ forceRefreshToken }: { forceRefreshToken: boolean }) => {
    if (logout) return Promise.resolve(null);
    const cached = snapshot.session;
    if (!forceRefreshToken && cached && cached.expiresAt > Date.now() + 30_000)
      return Promise.resolve(cached.accessToken);
    if (pending) return pending;
    const started = generation;
    pending = (async () => {
      try {
        if (started !== generation) return null;
        const response = await post("token");
        if (started !== generation) return null;
        if (response.status === 401) {
          await save(null);
          return null;
        }
        const next = await readSession(response);
        if (started !== generation) return null;
        if (!(await save(next)) || started !== generation) return null;
        return next.accessToken;
      } finally {
        pending = null;
        if (started === generation && snapshot.loading) await save(null);
      }
    })();
    return pending;
  };
  return {
    getSnapshot: () => snapshot,
    getServerSnapshot: () => empty,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    start: () => {
      channel = new BroadcastChannel("q9-auth-session");
      channel.addEventListener("message", (event: MessageEvent<unknown>) => {
        const message = event.data;
        if (!message || typeof message !== "object" || !("userId" in message)) return;
        if (message.userId !== null && typeof message.userId !== "string") return;
        if (logout) return;
        if (!snapshot.loading && message.userId === (snapshot.session?.user.id ?? null)) return;
        const started = ++generation;
        // Do not announce the temporary empty state while checking the shared cookie.
        void retireTransport().catch(() => null);
        snapshot = { session: null, loading: true };
        for (const listener of listeners) listener();
        void (pending ?? Promise.resolve())
          .catch(() => null)
          .then(async () => {
            if (started !== generation) return;
            await fetchAccessToken({ forceRefreshToken: true });
          })
          .catch(() => (started === generation ? save(null) : false));
      });
      let active = true;
      // StrictMode can restart the effect while the previous generation's
      // request is pending. Let it settle, then bootstrap this live generation.
      void (pending ?? Promise.resolve())
        .catch(() => null)
        .then(() => {
          if (active) return fetchAccessToken({ forceRefreshToken: false });
          return null;
        })
        .catch(async () => {
          if (active) await save(null);
        });
      return () => {
        active = false;
        channel?.close();
        channel = null;
        generation += 1;
      };
    },
    fetchAccessToken,
    signOut: async () => {
      if (logout) return logout;
      const started = ++generation;
      const closing = retireTransport();
      // Dispatch before touching memory: navigation must not discard queued logout.
      const request = post("sign-out", {}, true);
      logout = (async () => {
        try {
          const response = await request;
          if (!response.ok) throw new Error("auth_unavailable");
        } finally {
          logout = null;
          if (started === generation) {
            generation += 1;
            await save(null);
            notify(null);
          }
        }
      })();
      snapshot = { session: null, loading: true };
      for (const listener of listeners) listener();
      notify(null);
      await Promise.all([logout, closing]);
    },
    startEmail: async (email: string) => {
      await logout;
      const response = await post("email/start", { email });
      if (!response.ok) throw new Error("auth_unavailable");
    },
    verifyEmail: async (email: string, code: string) => {
      if (logout) await logout;
      const started = ++generation;
      await retireTransport();
      if (started !== generation) return;
      const next = await readSession(await post("email/verify", { email, code, client: "web" }));
      notify(next.user.id);
      if (started !== generation) return;
      await save(next);
    },
  };
}
