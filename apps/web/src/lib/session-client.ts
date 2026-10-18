import { Schema } from "effect";

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
async function readSession(response: Response) {
  if (!response.ok) throw new Error(response.status === 401 ? "invalid_code" : "auth_unavailable");
  return Schema.decodeUnknownSync(Session)(await response.json());
}

export function createSessionClient() {
  let snapshot: Snapshot = empty;
  let generation = 0;
  let pending: Promise<string | null> | null = null;
  let channel: BroadcastChannel | null = null;
  const listeners = new Set<() => void>();
  const notify = (userId: string | null) => {
    // eslint-disable-next-line unicorn/require-post-message-target-origin -- false positive: BroadcastChannel is same-origin and has no targetOrigin argument.
    channel?.postMessage({ userId });
  };
  const save = (session: Session | null) => {
    const changed = snapshot.loading || snapshot.session?.user.id !== session?.user.id;
    snapshot = { session, loading: false };
    if (changed) notify(session?.user.id ?? null);
    for (const listener of listeners) listener();
  };
  const fetchAccessToken = ({ forceRefreshToken }: { forceRefreshToken: boolean }) => {
    const cached = snapshot.session;
    if (!forceRefreshToken && cached && cached.expiresAt > Date.now() + 30_000)
      return Promise.resolve(cached.accessToken);
    if (pending) return pending;
    const started = generation;
    pending = (async () => {
      if (started !== generation) return null;
      const response = await post("token");
      if (started !== generation) return null;
      if (response.status === 401) {
        save(null);
        return null;
      }
      const next = await readSession(response);
      if (started !== generation) return null;
      save(next);
      return next.accessToken;
    })().finally(() => {
      pending = null;
      if (snapshot.loading) save(null);
    });
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
        if (!snapshot.loading && message.userId === (snapshot.session?.user.id ?? null)) return;
        generation += 1;
        // Do not announce the temporary empty state while checking the shared cookie.
        snapshot = { session: null, loading: true };
        for (const listener of listeners) listener();
        void (pending ?? Promise.resolve())
          .catch(() => null)
          .then(() => fetchAccessToken({ forceRefreshToken: true }))
          .catch(() => save(null));
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
        .catch(() => {
          if (active) save(null);
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
      // Dispatch before touching memory: navigation must not discard queued logout.
      const request = post("sign-out", {}, true);
      generation += 1;
      save(null);
      notify(null);
      const response = await request;
      if (!response.ok) throw new Error("auth_unavailable");
      generation += 1;
      save(null);
      notify(null);
    },
    startEmail: async (email: string) => {
      const response = await post("email/start", { email });
      if (!response.ok) throw new Error("auth_unavailable");
    },
    verifyEmail: async (email: string, code: string) => {
      const started = ++generation;
      const next = await readSession(await post("email/verify", { email, code, client: "web" }));
      notify(next.user.id);
      if (started !== generation) return;
      save(next);
    },
  };
}
