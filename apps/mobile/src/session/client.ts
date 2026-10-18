import * as Crypto from "expo-crypto";
import * as WebBrowser from "expo-web-browser";
import { useSyncExternalStore } from "react";

import * as authApi from "./authApi";
import { config } from "./config";
import {
  SignInIncompleteError,
  type PhoneSession,
  type SessionUser,
  type SignInMethod,
} from "./contracts";
import type { Jar } from "./cookies";
import {
  authorizeUrl,
  base64Url,
  CALLBACK_URL,
  callbackParams,
  toBase64Url,
  type CallbackParams,
  type Provider,
} from "./pkce";
import { tokenStore } from "./tokenStore";

export type Session = {
  accessToken: string;
  expiresAt: number;
  user: SessionUser;
  method: SignInMethod;
};
export type SessionState =
  | { status: "loading" }
  | { status: "unauthenticated" }
  | { status: "authenticated"; session: Session };

/** Refresh when the access token has under this long to live. */
const REFRESH_AHEAD_MS = 30_000;

// The session lives in this module, outside React, because Convex asks for tokens outside it too.
let state: SessionState = { status: "loading" };
let refreshToken: string | null = null;
/** Bumped by every sign-in and sign-out, so a refresh that finishes after one is dropped. */
let generation = 0;
let pending: Promise<string | null> | null = null;
let oauth: { state: string; verifier: string } | null = null;
const finished = new Map<string, Promise<void>>();
const jar: Jar = new Map();
const listeners = new Set<() => void>();

function publish(next: SessionState) {
  state = next;
  for (const listener of listeners) listener();
}

async function adopt(next: PhoneSession) {
  refreshToken = next.refreshToken;
  await tokenStore.write(next.refreshToken);
  publish({
    status: "authenticated",
    session: {
      accessToken: next.accessToken,
      expiresAt: next.expiresAt,
      user: next.user,
      method: next.method,
    },
  });
}

/** Drops the stored token only when it is still the one that failed, so a newer sign-in survives. */
async function forget(token: string) {
  if (refreshToken === token) refreshToken = null;
  if ((await tokenStore.read()) === token) await tokenStore.clear();
  publish({ status: "unauthenticated" });
}

function refresh(): Promise<string | null> {
  if (pending) return pending;
  const started = generation;
  const token = refreshToken;
  pending = (async () => {
    if (!token) return null;
    const next = await authApi.refreshSession(token);
    if (started !== generation) return null;
    if (!next) {
      await forget(token);
      return null;
    }
    await adopt(next);
    return next.accessToken;
  })().finally(() => {
    pending = null;
  });
  return pending;
}

async function bootstrap() {
  refreshToken = await tokenStore.read();
  if (!refreshToken) {
    publish({ status: "unauthenticated" });
    return;
  }
  try {
    await refresh();
  } catch {
    // The token stays stored, so the next launch can try again.
    publish({ status: "unauthenticated" });
  }
}

/** Convex's token source: the cached access token, or a refreshed one when it is about to expire. */
async function fetchAccessToken({ forceRefreshToken }: { forceRefreshToken: boolean }) {
  const current = state.status === "authenticated" ? state.session : null;
  if (!forceRefreshToken && current && current.expiresAt > Date.now() + REFRESH_AHEAD_MS)
    return current.accessToken;
  return refresh();
}

async function startEmail(email: string) {
  await authApi.startEmail(email, jar);
}

async function verifyEmail(email: string, code: string) {
  const started = ++generation;
  const next = await authApi.verifyEmail(email, code, jar);
  if (started === generation) await adopt(next);
}

/**
 * The code and state coming back from the Worker's phone-callback page. Both the auth session
 * and the deep-link route can deliver them, so a state is exchanged once and the answer reused.
 */
function finishOAuth(params: CallbackParams | null): Promise<void> {
  const known = params ? finished.get(params.state) : undefined;
  if (known) return known;
  const started = oauth;
  oauth = null;
  const work = (async () => {
    if (!params || !started || params.state !== started.state) throw new SignInIncompleteError();
    const generationAtStart = ++generation;
    const next = await authApi
      .exchangeOAuthCode(params.code, started.verifier, jar)
      .catch(() => Promise.reject(new SignInIncompleteError()));
    if (generationAtStart === generation) await adopt(next);
  })();
  if (params) finished.set(params.state, work);
  return work;
}

/** Opens Google or Apple in the system auth session and signs in with the code it returns. */
async function startOAuth(provider: Provider) {
  const verifier = base64Url(Crypto.getRandomBytes(32));
  const nonce = base64Url(Crypto.getRandomBytes(16));
  oauth = { state: nonce, verifier };
  await authApi.startOAuthExchange(verifier, jar);
  const challenge = toBase64Url(
    await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, verifier, {
      encoding: Crypto.CryptoEncoding.BASE64,
    }),
  );
  const result = await WebBrowser.openAuthSessionAsync(
    authorizeUrl({
      clientId: config.workosClientId,
      provider,
      redirectUri: `${config.authOrigin}/auth/phone-callback`,
      state: nonce,
      challenge,
    }),
    CALLBACK_URL,
  );
  if (result.type !== "success") {
    oauth = null;
    throw new SignInIncompleteError();
  }
  await finishOAuth(callbackParams(result.url));
}

/** Signs out of this phone at once; the promise rejects when the server did not confirm the revocation. */
async function signOut() {
  const token = refreshToken ?? (await tokenStore.read());
  generation += 1;
  refreshToken = null;
  publish({ status: "unauthenticated" });
  if (!token) return;
  // A failure leaves the token stored, so signing out again can finish the revocation.
  await authApi.revokeSession(token);
  await tokenStore.clear();
}

export const sessionClient = {
  bootstrap,
  fetchAccessToken,
  startEmail,
  verifyEmail,
  startOAuth,
  finishOAuth,
  signOut,
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const snapshot = () => state;

export function useSessionState(): SessionState {
  return useSyncExternalStore(subscribe, snapshot);
}
