import * as Crypto from "expo-crypto";
import * as WebBrowser from "expo-web-browser";
import { useSyncExternalStore } from "react";

import { createSessionClient, type RevokeStatus, type SessionState } from "./core.ts";
import { tokenStore } from "./tokenStore";

export type { RevokeStatus, Session, SessionState } from "./core.ts";

// The session lives outside React because Convex asks for tokens outside it too.
export const sessionClient = createSessionClient({
  store: tokenStore,
  openAuth: async (url, returnUrl) => {
    const result = await WebBrowser.openAuthSessionAsync(url, returnUrl);
    return result.type === "success" ? { type: "success", url: result.url } : { type: "closed" };
  },
  randomBytes: (length) => Crypto.getRandomBytes(length),
  sha256Base64: (text) =>
    Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, text, {
      encoding: Crypto.CryptoEncoding.BASE64,
    }),
  now: () => Date.now(),
});

export function useSessionState(): SessionState {
  return useSyncExternalStore(sessionClient.subscribe, sessionClient.snapshot);
}

/** Whether a sign-out is still waiting for the server to confirm it. */
export function useRevokeStatus(): RevokeStatus {
  return useSyncExternalStore(sessionClient.subscribe, sessionClient.revokeStatus);
}
