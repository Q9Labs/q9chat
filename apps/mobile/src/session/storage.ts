import { Either, Schema } from "effect";

/** The secrets the session keeps in the keychain, each under its own key. */
export type StoreKey = "refreshToken" | "pendingRevoke" | "oauthAttempt" | "emailAttempt";

export type Store = {
  get: (key: StoreKey) => Promise<string | null>;
  set: (key: StoreKey, value: string) => Promise<void>;
  delete: (key: StoreKey) => Promise<void>;
};

const Tokens = Schema.Array(Schema.String);
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

/** How long a started sign-in may take to come back before it is dropped. */
export const ATTEMPT_TTL_MS = 10 * 60 * 1000;

function parseJson(text: string | null): unknown {
  try {
    return text === null ? null : JSON.parse(text);
  } catch {
    return null;
  }
}

/** Refresh tokens of sessions that were signed out here but not yet revoked on the server. */
export async function readPending(store: Store): Promise<readonly string[]> {
  const decoded = Schema.decodeUnknownEither(Tokens)(parseJson(await store.get("pendingRevoke")));
  return Either.isRight(decoded) ? decoded.right : [];
}

export async function writePending(store: Store, tokens: readonly string[]) {
  if (tokens.length === 0) await store.delete("pendingRevoke");
  else await store.set("pendingRevoke", JSON.stringify(tokens));
}

/** The started OAuth attempt, or null when there is none, it is unreadable, or it has expired. */
export async function readAttempt(store: Store, now: number): Promise<OAuthAttempt | null> {
  const decoded = Schema.decodeUnknownEither(Attempt)(parseJson(await store.get("oauthAttempt")));
  return Either.isRight(decoded) && decoded.right.expiresAt > now ? decoded.right : null;
}

export const writeAttempt = (store: Store, attempt: OAuthAttempt) =>
  store.set("oauthAttempt", JSON.stringify(attempt));

/** The email whose code is still awaited, or null when there is none, it is unreadable, or it has expired. */
export async function readEmailAttempt(store: Store, now: number): Promise<EmailAttempt | null> {
  const decoded = Schema.decodeUnknownEither(EmailAttemptShape)(
    parseJson(await store.get("emailAttempt")),
  );
  return Either.isRight(decoded) && decoded.right.expiresAt > now ? decoded.right : null;
}

export const writeEmailAttempt = (store: Store, attempt: EmailAttempt) =>
  store.set("emailAttempt", JSON.stringify(attempt));
