import { Schema } from "effect";

import { Session } from "./auth/contracts.js";

const empty = { session: null, loading: true };
type Snapshot = { session: Session | null; loading: boolean };
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

function exclusive<T>(operation: () => Promise<T>) {
  return navigator.locks.request("q9-auth-session", operation);
}

export function createSessionClient() {
  let snapshot: Snapshot = empty;
  let generation = 0;
  let pending: Promise<string | null> | null = null;
  let channel: BroadcastChannel | null = null;
  const listeners = new Set<() => void>();
  const notify = (message: "signed-out" | "changed") => {
    // eslint-disable-next-line unicorn/require-post-message-target-origin -- false positive: BroadcastChannel is same-origin and has no targetOrigin argument.
    channel?.postMessage(message);
  };
  const save = (session: Session | null) => {
    snapshot = { session, loading: false };
    for (const listener of listeners) listener();
  };
  // All cookie writers share one cross-tab lock, not just refresh. Logout cannot
  // finish before an older verification's Set-Cookie has reached the browser.

  const fetchAccessToken = ({ forceRefreshToken }: { forceRefreshToken: boolean }) => {
    const cached = snapshot.session;
    if (!forceRefreshToken && cached && cached.expiresAt > Date.now() + 30_000)
      return Promise.resolve(cached.accessToken);
    if (pending) return pending;
    const started = generation;
    pending = exclusive(async () => {
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
    }).finally(() => {
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
        if (event.data !== "signed-out" && event.data !== "changed") return;
        generation += 1;
        save(null);
        if (event.data === "changed") {
          void (pending ?? Promise.resolve())
            .catch(() => null)
            .then(() => fetchAccessToken({ forceRefreshToken: true }))
            .catch(() => null);
        }
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
      const started = ++generation;
      const previous = snapshot.session;
      save(null);
      notify("signed-out");
      try {
        await exclusive(async () => {
          const response = await post("sign-out");
          if (!response.ok) throw new Error("auth_unavailable");
          save(null);
          notify("signed-out");
        });
      } catch (error) {
        // Revocation failed: do not present an active cookie as a completed logout.
        if (started === generation) {
          save(previous);
          await fetchAccessToken({ forceRefreshToken: true }).catch(() => null);
        }
        notify("changed");
        throw error;
      }
    },
    startEmail: async (email: string) => {
      const response = await post("email/start", { email });
      if (!response.ok) throw new Error("auth_unavailable");
    },
    verifyEmail: async (email: string, code: string) => {
      const started = ++generation;
      await exclusive(async () => {
        if (started !== generation) return;
        const next = await readSession(await post("email/verify", { email, code, client: "web" }));
        // Set-Cookie already changed shared browser state, even if another
        // tab invalidated this request's in-memory result in the meantime.
        notify("changed");
        if (started !== generation) return;
        save(next);
      });
    },
  };
}
