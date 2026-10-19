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
  isInviteToken,
  readAttempt,
  readEmailAttempt,
  readPendingInvite,
  writeAttempt,
  writeEmailAttempt,
  writePendingInvite,
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

/** What the session needs from the phone: the keychain, the system auth window and secure randomness. */
export type SessionEdges = {
  store: Store;
  clearLocalText?: () => void;
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

/** How many times a sign-out asks the server to revoke the token it held, while the app lives. */
const REVOKE_TRIES = 3;

const noop = () => {};

/** The invite a sign-in attempt carries, when the route that started it had a valid one. */
const inviteOf = (invite: string | undefined) =>
  invite && isInviteToken(invite) ? { invite } : {};

/**
 * The phone session. Every operation that touches the keychain or changes the session (restore,
 * refresh, sign-in, sign-out, the OAuth attempt) runs through one FIFO queue. No write can land
 * between another operation's read and write. Sign-out publishes immediately and cancels the request
 * in flight; its queued cleanup prevents a late write from restoring the session. Server revocation
 * runs separately after cleanup, with the token that sign-out read.
 * The refresh token is otherwise read from the keychain inside each operation and never kept here.
 */
export function createSessionClient(edges: SessionEdges) {
  const { store } = edges;
  const timeoutMs = edges.requestTimeoutMs ?? authApi.REQUEST_TIMEOUT_MS;
  let state: SessionState = { status: "loading" };
  const jar: Jar = new Map();
  const listeners = new Set<() => void>();

  let tail: Promise<unknown> = Promise.resolve();
  /** Counts queued operations, so a refresh is shared only with callers that queued nothing after it. */
  let queued = 0;
  /** Sign-outs whose keychain step is not done yet: nothing may publish a session meanwhile. */
  let leaving = 0;
  let cancelable: AbortController | null = null;
  let refreshing: { queued: number; promise: Promise<string | null> } | null = null;
  /** The open sign-in window of this process; a new one starts only when it is null. */
  let liveWindow: object | null = null;
  /** The last link handed to `finishOAuth`, so the window and the deep-link route share one exchange. */
  let delivered: { state: string; code: string; promise: Promise<void> } | null = null;

  /** The account whose session this client last held; null once it signed out. */
  let account: string | null = null;
  /** Counts the sessions this client has ended, so the app can give each one its own Convex client. */
  let epoch = 0;

  const publish = (next: SessionState) => {
    const accountNow =
      next.status === "authenticated"
        ? next.session.user.id
        : next.status === "unauthenticated"
          ? null
          : account;
    if (account !== null && accountNow !== account) epoch += 1;
    account = accountNow;
    state = next;
    for (const listener of listeners) listener();
  };
  const publishUnlessLeaving = (next: SessionState) => {
    if (leaving === 0) publish(next);
  };
  function enqueue<T>(work: () => Promise<T>): Promise<T> {
    queued += 1;
    const result = tail.then(work);
    tail = result.then(noop, noop);
    return result;
  }

  /** One Worker request; a sign-out can cancel it while it is `cancelable`. */
  async function request<T>(call: (options: authApi.RequestOptions) => Promise<T>) {
    if (leaving > 0) throw new Error("signed_out");
    const controller = new AbortController();
    cancelable = controller;
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
        clearLocalText();
        return null;
      }
      const next = await request((options) => authApi.refreshSession(token, options));
      if (!next) {
        // A confirmed 401: the session is gone for good.
        publishUnlessLeaving({ status: "unauthenticated" });
        await clearLocalSession();
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

  /** Restores at launch; transient failures keep local data and wait for Retry. */
  async function bootstrap() {
    await enqueue(async () => {
      await sweepAttempts().catch(noop);
      return restore();
    });
  }

  /** Tries again after "Can't connect": on the button and when the app returns to the foreground. */
  async function retry() {
    if (state.status === "offline") {
      publish({ status: "loading" });
      await refresh();
    }
    await enqueue(sweepAttempts).catch(noop);
  }

  /** Convex's token source: the cached access token, or a refreshed one when it is about to expire. */
  async function fetchAccessToken({ forceRefreshToken }: { forceRefreshToken: boolean }) {
    const current = state.status === "authenticated" ? state.session : null;
    if (!forceRefreshToken && current && current.expiresAt > edges.now() + REFRESH_AHEAD_MS)
      return current.accessToken;
    return refresh();
  }

  /** Forgets both started sign-ins: their transaction cookies and their saved records. */
  async function clearAttempts() {
    jar.delete("q9_phone");
    jar.delete("q9_email");
    await store.delete("oauthAttempt");
    await store.delete("emailAttempt");
  }

  /** Deletes a saved attempt that has expired or cannot be read; the readers delete as they meet one. */
  async function sweepAttempts() {
    await readAttempt(store, edges.now());
    await readEmailAttempt(store, edges.now());
  }

  /**
   * A sign-in, by email or OAuth, ends every other attempt in the same step that adopts its session.
   * The invite goes with it: the one this attempt was started for is saved for the first screen to
   * take, and any other saved invite is deleted (a failure to delete fails the sign-in), so a later
   * account never meets an invite that belongs to another attempt.
   */
  async function signIn(next: PhoneSession, invite: string | undefined) {
    await clearAttempts();
    await store.delete("pendingInvite");
    if (invite) await writePendingInvite(store, invite, edges.now()).catch(noop);
    await adopt(next);
  }

  /** Sends the code and saves the attempt with the Worker's email transaction cookie, so a restarted app can finish it. */
  const startEmail = (email: string, invite?: string) =>
    enqueue(async () => {
      jar.delete("q9_email");
      await request((options) => authApi.startEmail(email, jar, options));
      await writeEmailAttempt(store, {
        email,
        expiresAt: edges.now() + ATTEMPT_TTL_MS,
        cookies: [...jar].filter(([name]) => name === "q9_email"),
        ...inviteOf(invite),
      });
    });

  /** Puts the saved email cookie back in the jar and returns that attempt; null when nothing valid is saved, or it is for another email than the one named. */
  async function restoreEmailCookie(email?: string) {
    const saved = await readEmailAttempt(store, edges.now());
    if (!saved || (email !== undefined && saved.email !== email)) return null;
    for (const [name, value] of saved.cookies) jar.set(name, value);
    return saved;
  }

  /** The email a code was sent to before the app was killed, when it is still within ten minutes; null otherwise. */
  const resumeEmail = () =>
    enqueue(async () => (await restoreEmailCookie())?.email ?? null).catch(() => null);

  /** "Use a different email": forgets the code that was sent. */
  const discardEmail = () => {
    jar.delete("q9_email");
    return enqueue(() => store.delete("emailAttempt")).catch(noop);
  };

  const verifyEmail = (email: string, code: string) =>
    enqueue(async () => {
      const attempt = await restoreEmailCookie(email);
      // The saved attempt is for this email by construction; the code is checked against the attempt's own address.
      const target = attempt?.email ?? email;
      const next = await request((options) => authApi.verifyEmail(target, code, jar, options));
      await signIn(next, attempt?.invite);
    });

  /** Saves a started attempt, with the Worker's transaction cookie, so a restarted app can finish it. */
  async function beginAttempt(provider: Provider, invite: string | undefined) {
    const verifier = base64Url(edges.randomBytes(32));
    const nonce = base64Url(edges.randomBytes(16));
    jar.delete("q9_phone");
    await request((options) => authApi.startOAuthExchange(verifier, jar, options));
    const attempt: OAuthAttempt = {
      state: nonce,
      verifier,
      expiresAt: edges.now() + ATTEMPT_TTL_MS,
      cookies: [...jar].filter(([name]) => name === "q9_phone"),
      ...inviteOf(invite),
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

  /** Removes the saved attempt and its cookie, but never a replacement attempt with another state. */
  async function dropAttempt(attemptState: string) {
    const saved = await readAttempt(store, edges.now());
    if (saved && saved.state !== attemptState) return;
    jar.delete("q9_phone");
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
      await signIn(next, attempt.invite);
    } catch {
      throw new SignInIncompleteError();
    } finally {
      jar.delete("q9_phone");
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

  /** The link the auth window returned, or null when it did not open, was closed, or returned something that is not a sign-in link. */
  async function openWindow(url: string): Promise<CallbackParams | null> {
    try {
      const result = await edges.openAuth(url, CALLBACK_URL);
      return result.type === "success" ? callbackParams(result.url) : null;
    } catch {
      return null;
    }
  }

  /** Opens Google or Apple in the system auth window and signs in with the code it returns. */
  async function startOAuth(provider: Provider, invite?: string) {
    if (liveWindow) throw new SignInIncompleteError();
    const mine = {};
    liveWindow = mine;
    delivered = null;
    try {
      const started = await enqueue(() => beginAttempt(provider, invite));
      const params = await openWindow(started.url);
      if (!params) {
        await enqueue(() => dropAttempt(started.state)).catch(noop);
        throw new SignInIncompleteError();
      }
      await finishOAuth(params);
    } finally {
      if (liveWindow === mine) liveWindow = null;
    }
  }

  /** The invite a finished sign-in saved, once: reading it deletes it, so it is never offered twice. */
  const takeInvite = () =>
    enqueue(async () => {
      const token = await readPendingInvite(store, edges.now());
      if (token) await store.delete("pendingInvite");
      return token;
    });

  /**
   * The route of `token` went away: the sign-in it started stops carrying the invite, and a saved
   * copy is deleted. When a delete fails the invite stays with that attempt only, and no other
   * sign-in will hand it on.
   */
  const forgetInvite = (token: string) =>
    enqueue(async () => {
      const email = await readEmailAttempt(store, edges.now());
      if (email?.invite === token)
        await writeEmailAttempt(store, {
          email: email.email,
          expiresAt: email.expiresAt,
          cookies: email.cookies,
        });
      const oauth = await readAttempt(store, edges.now());
      if (oauth?.invite === token)
        await writeAttempt(store, {
          state: oauth.state,
          verifier: oauth.verifier,
          expiresAt: oauth.expiresAt,
          cookies: oauth.cookies,
        });
      if ((await readPendingInvite(store, edges.now())) === token)
        await store.delete("pendingInvite");
    });

  /** Asks the server to revoke a signed-out token. Nothing is saved: if the app ends first, the server session runs out by itself. */
  async function revokeQuietly(token: string) {
    for (let attempt = 0; attempt < REVOKE_TRIES; attempt += 1) {
      try {
        // react-doctor-disable-next-line react-doctor/async-await-in-loop -- the tries are one after another by design
        await authApi.revokeSession(token, { timeoutMs }); // oxlint-disable-line no-await-in-loop
        return;
      } catch {
        // Try again, up to REVOKE_TRIES.
      }
    }
  }

  function clearLocalText() {
    try {
      edges.clearLocalText?.();
    } catch {
      /* Continue clearing auth keys after local-file failure. */
    }
  }

  /** Shared by explicit sign-out and a rejected saved session or refresh. */
  async function clearLocalSession() {
    liveWindow = null;
    delivered = null;
    jar.clear();
    clearLocalText();
    // One unavailable key must not prevent the other local session keys from being removed.
    await Promise.all([
      store.delete("pendingInvite").catch(noop),
      store.delete("refreshToken").catch(noop),
      store.delete("oauthAttempt").catch(noop),
      store.delete("emailAttempt").catch(noop),
    ]);
  }

  /** Ends the local session immediately; storage cleanup and server revocation cannot block sign-in. */
  async function signOut(): Promise<void> {
    leaving += 1;
    cancelable?.abort(new Error("signed_out"));
    liveWindow = null;
    delivered = null;
    jar.clear();
    publish({ status: "unauthenticated" });
    const token = await enqueue(async () => {
      try {
        const active = await store.get("refreshToken").catch(() => null);
        await clearLocalSession();
        return active;
      } finally {
        leaving -= 1;
      }
    });
    if (token) void revokeQuietly(token);
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
    resumeEmail,
    discardEmail,
    verifyEmail,
    startOAuth,
    finishOAuth,
    takeInvite,
    forgetInvite,
    signOut,
    subscribe,
    snapshot: () => state,
    epoch: () => epoch,
  };
}
