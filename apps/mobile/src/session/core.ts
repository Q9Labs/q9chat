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
import {
  ATTEMPT_TTL_MS,
  readAttempt,
  readPending,
  writeAttempt,
  writePending,
  type OAuthAttempt,
  type Store,
} from "./storage.ts";

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

/** A sign-out that the server has not confirmed yet: it is retried until it is. */
export type RevokeStatus = "idle" | "revoking" | "failed";

/** What the session needs from the phone: the keychain, the system auth window and secure randomness. */
export type SessionEdges = {
  store: Store;
  /** Opens the sign-in page; resolves with the returning link, or `closed` when the person left. */
  openAuth: (
    url: string,
    returnUrl: string,
  ) => Promise<{ type: "success"; url: string } | { type: "closed" }>;
  randomBytes: (length: number) => Uint8Array;
  sha256Base64: (text: string) => Promise<string>;
  now: () => number;
  /** The most one Worker request may take; 15 seconds unless a test shortens it. */
  requestTimeoutMs?: number;
};

/** Refresh when the access token has under this long to live. */
const REFRESH_AHEAD_MS = 30_000;

const noop = () => {};

/**
 * The phone session. Every operation that touches the keychain or changes the session (restore,
 * refresh, sign-in, sign-out, the revoke retry, the OAuth attempt) runs through one FIFO queue, start
 * to finish: keychain read, Worker request, keychain write, publish. So no write can land between
 * another operation's read and write, and a late answer can never undo a newer change. Only a
 * sign-out jumps ahead in one way: it cancels the request in flight and hides the session at once.
 * The refresh token is read from the keychain inside each operation and never kept here.
 */
export function createSessionClient(edges: SessionEdges) {
  const { store } = edges;
  const timeoutMs = edges.requestTimeoutMs ?? authApi.REQUEST_TIMEOUT_MS;
  let state: SessionState = { status: "loading" };
  let revoke: RevokeStatus = "idle";
  const jar: Jar = new Map();
  const listeners = new Set<() => void>();

  let tail: Promise<unknown> = Promise.resolve();
  /** Counts queued operations, so a refresh is shared only with callers that queued nothing after it. */
  let queued = 0;
  /** Sign-outs whose keychain move is not done yet: nothing may publish a session meanwhile. */
  let leaving = 0;
  let cancelable: AbortController | null = null;
  let refreshing: { queued: number; promise: Promise<string | null> } | null = null;
  /** The open sign-in window of this process; a new one starts only when it is null. */
  let liveWindow: object | null = null;
  /** The last link handed to `finishOAuth`, so the window and the deep-link route share one exchange. */
  let delivered: { state: string; code: string; promise: Promise<void> } | null = null;

  const publish = (next: SessionState) => {
    state = next;
    for (const listener of listeners) listener();
  };
  const publishUnlessLeaving = (next: SessionState) => {
    if (leaving === 0) publish(next);
  };
  const setRevoke = (next: RevokeStatus) => {
    if (revoke === next) return;
    revoke = next;
    for (const listener of listeners) listener();
  };

  function enqueue<T>(work: () => Promise<T>): Promise<T> {
    queued += 1;
    const result = tail.then(work);
    tail = result.then(noop, noop);
    return result;
  }

  /** One Worker request; a sign-out can cancel it while it is `cancelable`. */
  async function request<T>(call: (options: authApi.RequestOptions) => Promise<T>, cancels = true) {
    if (cancels && leaving > 0) throw new Error("signed_out");
    const controller = new AbortController();
    if (cancels) cancelable = controller;
    try {
      return await call({ signal: controller.signal, timeoutMs });
    } finally {
      if (cancelable === controller) cancelable = null;
    }
  }

  /** Saves the replacement token first, then publishes the session. */
  async function adopt(next: PhoneSession) {
    await store.set("refreshToken", next.refreshToken);
    publishUnlessLeaving({
      status: "authenticated",
      session: {
        accessToken: next.accessToken,
        expiresAt: next.expiresAt,
        user: next.user,
        method: next.method,
      },
    });
  }

  /** The restore or refresh body. It never throws: a failure that is not a confirmed 401 keeps the token and goes offline. */
  async function restore(): Promise<string | null> {
    try {
      const token = await store.get("refreshToken");
      if (!token) {
        publishUnlessLeaving({ status: "unauthenticated" });
        return null;
      }
      const next = await request((options) => authApi.refreshSession(token, options));
      if (!next) {
        // A confirmed 401: the session is gone for good.
        await store.delete("refreshToken");
        publishUnlessLeaving({ status: "unauthenticated" });
        return null;
      }
      await adopt(next);
      return leaving === 0 ? next.accessToken : null;
    } catch {
      publishUnlessLeaving({ status: "offline" });
      return null;
    }
  }

  function refresh(): Promise<string | null> {
    if (refreshing?.queued === queued) return refreshing.promise;
    const promise = enqueue(restore).finally(() => {
      if (refreshing?.promise === promise) refreshing = null;
    });
    refreshing = { queued, promise };
    return promise;
  }

  /** Revokes the given signed-out sessions, oldest first, saving the rest after each; throws on the first failure. */
  async function revokeEach(tokens: readonly string[]) {
    const [token, ...rest] = tokens;
    if (token === undefined) return;
    await request((options) => authApi.revokeSession(token, options), false);
    await writePending(store, rest);
    await revokeEach(rest);
  }

  async function revokePending() {
    const tokens = await readPending(store);
    if (tokens.length === 0) return setRevoke("idle");
    setRevoke("revoking");
    await revokeEach(tokens);
    setRevoke("idle");
  }

  async function revokeOrFail() {
    try {
      await revokePending();
    } catch (error) {
      setRevoke("failed");
      throw error;
    }
  }

  /**
   * A crash can land between a sign-out writing its pending token and deleting the active one. The
   * pending token wins: that session stays signed out, and nothing refreshes it.
   */
  async function dropSignedOutToken() {
    try {
      const active = await store.get("refreshToken");
      if (active && (await readPending(store)).includes(active)) await store.delete("refreshToken");
    } catch {
      // An unreadable keychain surfaces as offline in the restore that follows.
    }
  }

  /** Restores the saved session at launch, then retries any sign-out the server never confirmed. */
  async function bootstrap() {
    await enqueue(async () => {
      await dropSignedOutToken();
      return restore();
    });
    await enqueue(revokeOrFail).catch(noop);
  }

  /** Tries again after "Can't connect" or a failed revoke: on the button and when the app returns to the foreground. */
  async function retry() {
    if (state.status === "offline") {
      publish({ status: "loading" });
      await refresh();
    }
    if (revoke === "failed") await enqueue(revokeOrFail).catch(noop);
  }

  /** Convex's token source: the cached access token, or a refreshed one when it is about to expire. */
  async function fetchAccessToken({ forceRefreshToken }: { forceRefreshToken: boolean }) {
    const current = state.status === "authenticated" ? state.session : null;
    if (!forceRefreshToken && current && current.expiresAt > edges.now() + REFRESH_AHEAD_MS)
      return current.accessToken;
    return refresh();
  }

  const startEmail = (email: string) => authApi.startEmail(email, jar, { timeoutMs });

  const verifyEmail = (email: string, code: string) =>
    enqueue(async () => {
      const next = await request((options) => authApi.verifyEmail(email, code, jar, options));
      await adopt(next);
    });

  /** Saves a started attempt, with the Worker's transaction cookie, so a restarted app can finish it. */
  async function beginAttempt(provider: Provider) {
    const verifier = base64Url(edges.randomBytes(32));
    const nonce = base64Url(edges.randomBytes(16));
    jar.delete("q9_phone");
    await request((options) => authApi.startOAuthExchange(verifier, jar, options));
    const attempt: OAuthAttempt = {
      state: nonce,
      verifier,
      expiresAt: edges.now() + ATTEMPT_TTL_MS,
      cookies: [...jar],
    };
    await writeAttempt(store, attempt);
    const challenge = toBase64Url(await edges.sha256Base64(verifier));
    const url = authorizeUrl({
      clientId: config.workosClientId,
      provider,
      redirectUri: `${config.authOrigin}/auth/phone-callback`,
      state: nonce,
      challenge,
    });
    return { state: nonce, url };
  }

  /** Removes the saved attempt, but only if it is the one with this state. */
  async function dropAttempt(attemptState: string) {
    if ((await readAttempt(store, edges.now()))?.state === attemptState)
      await store.delete("oauthAttempt");
  }

  async function exchangeAttempt(params: CallbackParams | null) {
    const attempt = params ? await readAttempt(store, edges.now()) : null;
    // A link that does not match the saved attempt is refused and leaves it alone.
    if (!params || !attempt || attempt.state !== params.state) throw new SignInIncompleteError();
    for (const [name, value] of attempt.cookies) jar.set(name, value);
    try {
      const next = await request((options) =>
        authApi.exchangeOAuthCode(params.code, attempt.verifier, jar, options),
      );
      await adopt(next);
    } catch {
      throw new SignInIncompleteError();
    } finally {
      await store.delete("oauthAttempt");
    }
  }

  /**
   * The code and state coming back from the Worker's phone-callback page. The auth session and the
   * deep-link route can both deliver them, and after the app was restarted only the route can, so the
   * attempt comes from the keychain. The same link delivered twice shares one exchange.
   */
  function finishOAuth(params: CallbackParams | null): Promise<void> {
    if (delivered && params?.state === delivered.state)
      return params.code === delivered.code
        ? delivered.promise
        : Promise.reject(new SignInIncompleteError());
    const promise = enqueue(() => exchangeAttempt(params));
    if (params) delivered = { state: params.state, code: params.code, promise };
    return promise;
  }

  /** Opens Google or Apple in the system auth window and signs in with the code it returns. */
  async function startOAuth(provider: Provider) {
    if (liveWindow) throw new SignInIncompleteError();
    const mine = {};
    liveWindow = mine;
    delivered = null;
    try {
      const started = await enqueue(() => beginAttempt(provider));
      const result = await edges.openAuth(started.url, CALLBACK_URL);
      if (result.type !== "success") {
        await enqueue(() => dropAttempt(started.state)).catch(noop);
        throw new SignInIncompleteError();
      }
      await finishOAuth(callbackParams(result.url));
    } finally {
      if (liveWindow === mine) liveWindow = null;
    }
  }

  /** Moves the active session's token to the pending list, so a failed revoke can be retried later. */
  async function moveToPending() {
    const active = await store.get("refreshToken");
    if (active) {
      await writePending(store, [...(await readPending(store)), active]);
      await store.delete("refreshToken");
    }
    await store.delete("oauthAttempt");
  }

  /**
   * Signs out of this phone at once; the promise rejects when the server did not confirm the revocation.
   * The token stays pending in the keychain until it does, across restarts, and a new sign-in does not touch it.
   */
  function signOut() {
    leaving += 1;
    cancelable?.abort(new Error("signed_out"));
    liveWindow = null;
    delivered = null;
    publish({ status: "unauthenticated" });
    setRevoke("revoking");
    return enqueue(async () => {
      try {
        await moveToPending();
      } catch (error) {
        setRevoke("failed");
        throw error;
      } finally {
        leaving -= 1;
      }
      await revokeOrFail();
    });
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
    revokeStatus: () => revoke,
  };
}
