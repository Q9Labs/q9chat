export type Provider = "google" | "apple";

/** The deep link the Worker's /auth/phone-callback page sends the person back to. */
export const CALLBACK_URL = "q9chat://auth/callback";

const AUTHORIZE_URL = "https://api.workos.com/user_management/authorize";

/** Standard base64 text to the URL-safe alphabet without padding, as PKCE wants it. */
export const toBase64Url = (base64: string) =>
  base64.replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");

export const base64Url = (bytes: Uint8Array) => toBase64Url(btoa(String.fromCharCode(...bytes)));

/** The WorkOS page the system auth session opens; it returns to `redirectUri` with a code and the state. */
export function authorizeUrl(input: {
  clientId: string;
  provider: Provider;
  redirectUri: string;
  state: string;
  challenge: string;
}): string {
  const query = {
    client_id: input.clientId,
    provider: input.provider === "google" ? "GoogleOAuth" : "AppleOAuth",
    response_type: "code",
    redirect_uri: input.redirectUri,
    state: input.state,
    code_challenge: input.challenge,
    code_challenge_method: "S256",
  };
  return `${AUTHORIZE_URL}?${Object.entries(query)
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join("&")}`;
}

export type CallbackParams = { code: string; state: string };

/** The code and state of a returning link, or null for a cancelled, failed or malformed one. */
export function callbackParams(url: string): CallbackParams | null {
  const query = url.split("#")[0]?.split("?")[1];
  if (!query) return null;
  const params = new Map<string, string>();
  for (const pair of query.split("&")) {
    const [key, value = ""] = pair.split("=");
    if (key) params.set(decodeURIComponent(key), decodeURIComponent(value.replaceAll("+", " ")));
  }
  const code = params.get("code");
  const state = params.get("state");
  return code && state && !params.has("error") ? { code, state } : null;
}
