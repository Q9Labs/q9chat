import * as authApi from "./authApi.ts";
import { config } from "./config.ts";
import {
  SignInIncompleteError,
  type PhoneSession,
  type SessionUser,
  type SignInMethod,
} from "./contracts.ts";
import type { Jar } from "./cookies.ts";
import {
  authorizeUrl,
  base64Url,
  CALLBACK_URL,
  callbackParams,
  toBase64Url,
  type CallbackParams,
  type Provider,
} from "./pkce.ts";

export type Session = {
  accessToken: string;
  expiresAt: number;
  user: SessionUser;
  method: SignInMethod;
};
export type SessionState =
  | { status: "loading" }
  | { status: "unauthenticated" }
  /** A saved session could not be checked (no connection, or the keychain failed); the token is kept. */
  | { status: "offline" }
  | { status: "authenticated"; session: Session };

/** What the session needs from the phone: the keychain, the system auth window and secure randomness. */
export type SessionEdges = {
  store: {
    read: () => Promise<string | null>;
    write: (token: string) => Promise<void>;
    clear: () => Promise<void>;
  };
  /** Opens the sign-in page; resolves with the returning link, or `closed` when the person left. */
  openAuth: (
    url: string,
    returnUrl: string,
  ) => Promise<{ type: "success"; url: string } | { type: "closed" }>;
  randomBytes: (length: number) => Uint8Array;
  sha256Base64: (text: string) => Promise<string>;
  now: () => number;
};

/** Refresh when the access token has under this long to live. */
const REFRESH_AHEAD_MS = 30_000;

type Attempt = {
  state: string;
  verifier: string;
  /** The code exchange, once a returning link has started it; a second delivery of the same link joins it. */
  exchange: Promise<void> | null;
  code: string | null;
};

/**
 * The phone session. This closure is the one owner of every transition (restore, refresh, sign-in,
 * sign-out). Each transition takes a generation when it starts, rechecks it after every await, and
 * clears only the refresh token it was working on, so an older transition can never undo a newer one.
 * The refresh token is read from the keychain inside each operation and never kept here.
 */
export function createSessionClient(edges: SessionEdges) {
  const { store } = edges;
  let state: SessionState = { status: "loading" };
  let generation = 0;
  let refreshing: { generation: number; promise: Promise<string | null> } | null = null;
  let attempt: Attempt | null = null;
  const jar: Jar = new Map();
  const listeners = new Set<() => void>();

  function publish(next: SessionState) {
    state = next;
    for (const listener of listeners) listener();
  }

  /** Removes `token` from the keychain only while it is still the stored one, so a newer sign-in survives. */
  async function clearIfStored(token: string) {
    if ((await store.read()) === token) await store.clear();
  }

  /** Saves the replacement token first, then publishes; false when another transition took over meanwhile. */
  async function adopt(next: PhoneSession, mine: number) {
    await store.write(next.refreshToken);
    if (mine !== generation) {
      await clearIfStored(next.refreshToken);
      return false;
    }
    publish({
      status: "authenticated",
      session: {
        accessToken: next.accessToken,
        expiresAt: next.expiresAt,
        user: next.user,
        method: next.method,
      },
    });
    return true;
  }

  /** The restore or refresh body. It never throws: a failure that is not a confirmed 401 keeps the token and goes offline. */
  async function refreshOnce(mine: number): Promise<string | null> {
    try {
      return await restore(mine);
    } catch {
      if (mine === generation) publish({ status: "offline" });
      return null;
    }
  }

  async function restore(mine: number): Promise<string | null> {
    const token = await store.read();
    if (mine !== generation) return null;
    if (!token) {
      publish({ status: "unauthenticated" });
      return null;
    }
    const next = await authApi.refreshSession(token);
    if (mine !== generation) return null;
    if (!next) {
      await expire(token, mine);
      return null;
    }
    return (await adopt(next, mine)) ? next.accessToken : null;
  }

  /** A confirmed 401: the session is gone for good. */
  async function expire(token: string, mine: number) {
    await clearIfStored(token);
    if (mine === generation) publish({ status: "unauthenticated" });
  }

  function refresh(): Promise<string | null> {
    if (refreshing?.generation === generation) return refreshing.promise;
    const mine = generation;
    const promise = refreshOnce(mine).finally(() => {
      if (refreshing?.promise === promise) refreshing = null;
    });
    refreshing = { generation: mine, promise };
    return promise;
  }

  /** Restores the saved session at launch. */
  async function bootstrap() {
    await refresh();
  }

  /** Tries the saved session again after "Can't connect", on the button and when the app returns to the foreground. */
  async function retry() {
    if (state.status !== "offline") return;
    publish({ status: "loading" });
    await refresh();
  }

  /** Convex's token source: the cached access token, or a refreshed one when it is about to expire. */
  async function fetchAccessToken({ forceRefreshToken }: { forceRefreshToken: boolean }) {
    const current = state.status === "authenticated" ? state.session : null;
    if (!forceRefreshToken && current && current.expiresAt > edges.now() + REFRESH_AHEAD_MS)
      return current.accessToken;
    return refresh();
  }

  async function startEmail(email: string) {
    await authApi.startEmail(email, jar);
  }

  async function verifyEmail(email: string, code: string) {
    const mine = ++generation;
    const next = await authApi.verifyEmail(email, code, jar);
    await adopt(next, mine);
  }

  /**
   * The code and state coming back from the Worker's phone-callback page. The auth session and the
   * deep-link route can both deliver them, so the live attempt exchanges its code once and both
   * deliveries share the answer. A link that does not match the live attempt is refused and leaves it alone.
   */
  function finishOAuth(params: CallbackParams | null): Promise<void> {
    const current = attempt;
    if (!params || !current || params.state !== current.state)
      return Promise.reject(new SignInIncompleteError());
    if (current.exchange)
      return params.code === current.code
        ? current.exchange
        : Promise.reject(new SignInIncompleteError());
    current.code = params.code;
    const mine = ++generation;
    current.exchange = (async () => {
      try {
        const next = await authApi
          .exchangeOAuthCode(params.code, current.verifier, jar)
          .catch(() => Promise.reject(new SignInIncompleteError()));
        if (!(await adopt(next, mine))) throw new SignInIncompleteError();
      } finally {
        if (attempt === current) attempt = null;
      }
    })();
    return current.exchange;
  }

  /** Opens Google or Apple in the system auth window and signs in with the code it returns. */
  async function startOAuth(provider: Provider) {
    if (attempt) throw new SignInIncompleteError();
    const mine: Attempt = {
      state: base64Url(edges.randomBytes(16)),
      verifier: base64Url(edges.randomBytes(32)),
      exchange: null,
      code: null,
    };
    attempt = mine;
    try {
      await authApi.startOAuthExchange(mine.verifier, jar);
      const challenge = toBase64Url(await edges.sha256Base64(mine.verifier));
      const result = await edges.openAuth(
        authorizeUrl({
          clientId: config.workosClientId,
          provider,
          redirectUri: `${config.authOrigin}/auth/phone-callback`,
          state: mine.state,
          challenge,
        }),
        CALLBACK_URL,
      );
      if (result.type !== "success") throw new SignInIncompleteError();
      // The deep-link route may have delivered the link first; then its exchange is the answer.
      await (mine.exchange ?? finishOAuth(callbackParams(result.url)));
    } finally {
      if (attempt === mine) attempt = null;
    }
  }

  /** Signs out of this phone at once; the promise rejects when the server did not confirm the revocation. */
  async function signOut() {
    ++generation;
    attempt = null;
    publish({ status: "unauthenticated" });
    // A failure leaves the token stored, so signing out again can finish the revocation.
    const token = await store.read();
    if (!token) return;
    await authApi.revokeSession(token);
    await clearIfStored(token);
  }

  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };

  return {
    bootstrap,
    retry,
    fetchAccessToken,
    startEmail,
    verifyEmail,
    startOAuth,
    finishOAuth,
    signOut,
    subscribe,
    snapshot: () => state,
  };
}
