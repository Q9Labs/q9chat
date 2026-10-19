import { Either, Schema } from "effect";

/** The secrets the session keeps in the keychain, each under its own key. */
export type StoreKey = "refreshToken" | "oauthAttempt" | "emailAttempt" | "pendingInvite";

export type Store = {
  get: (key: StoreKey) => Promise<string | null>;
  set: (key: StoreKey, value: string) => Promise<void>;
  delete: (key: StoreKey) => Promise<void>;
};

const Attempt = Schema.Struct({
  state: Schema.String,
  verifier: Schema.String,
  /** Unix time in milliseconds after which the attempt no longer counts. */
  expiresAt: Schema.Number,
  /** The Worker's transaction cookie material, so a restarted app can finish the exchange. */
  cookies: Schema.Array(Schema.Tuple(Schema.String, Schema.String)),
});
export type OAuthAttempt = typeof Attempt.Type;

/** A code sent to this email, with the Worker's transaction cookie, so a restarted app can still verify it. */
const EmailAttemptShape = Schema.Struct({
  email: Schema.String,
  expiresAt: Schema.Number,
  cookies: Schema.Array(Schema.Tuple(Schema.String, Schema.String)),
});
export type EmailAttempt = typeof EmailAttemptShape.Type;

/** The invite link someone opened before they could use it (signed out, or still setting up). */
const InviteRecord = Schema.Struct({ token: Schema.String, expiresAt: Schema.Number });

/** How long a started sign-in may take to come back before it is dropped. */
export const ATTEMPT_TTL_MS = 10 * 60 * 1000;

function parseJson(text: string | null): unknown {
  try {
    return text === null ? null : JSON.parse(text);
  } catch {
    return null;
  }
}

/** The started OAuth attempt, or null when there is none. One that is unreadable or has expired is deleted. */
export async function readAttempt(store: Store, now: number): Promise<OAuthAttempt | null> {
  const saved = await store.get("oauthAttempt");
  const decoded = Schema.decodeUnknownEither(Attempt)(parseJson(saved));
  if (Either.isRight(decoded) && decoded.right.expiresAt > now) return decoded.right;
  if (saved !== null) await store.delete("oauthAttempt");
  return null;
}

export const writeAttempt = (store: Store, attempt: OAuthAttempt) =>
  store.set("oauthAttempt", JSON.stringify(attempt));

/** The email whose code is still awaited, or null when there is none. One that is unreadable or has expired is deleted. */
export async function readEmailAttempt(store: Store, now: number): Promise<EmailAttempt | null> {
  const saved = await store.get("emailAttempt");
  const decoded = Schema.decodeUnknownEither(EmailAttemptShape)(parseJson(saved));
  if (Either.isRight(decoded) && decoded.right.expiresAt > now) return decoded.right;
  if (saved !== null) await store.delete("emailAttempt");
  return null;
}

export const writeEmailAttempt = (store: Store, attempt: EmailAttempt) =>
  store.set("emailAttempt", JSON.stringify(attempt));

/** An invite token as the API accepts it: 16 to 32 base62 characters. */
export const isInviteToken = (token: string) => /^[A-Za-z0-9]{16,32}$/u.test(token);

/** The invite waiting for its person to sign in, or null. One that is unreadable, malformed or older than ten minutes is deleted. */
export async function readPendingInvite(store: Store, now: number): Promise<string | null> {
  const saved = await store.get("pendingInvite");
  const decoded = Schema.decodeUnknownEither(InviteRecord)(parseJson(saved));
  if (
    Either.isRight(decoded) &&
    decoded.right.expiresAt > now &&
    isInviteToken(decoded.right.token)
  )
    return decoded.right.token;
  if (saved !== null) await store.delete("pendingInvite");
  return null;
}

export const writePendingInvite = (store: Store, token: string, now: number) =>
  store.set("pendingInvite", JSON.stringify({ token, expiresAt: now + ATTEMPT_TTL_MS }));
