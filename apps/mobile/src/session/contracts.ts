import { Schema } from "effect";

const Method = Schema.Literal("email", "google", "apple");
const User = Schema.Struct({
  id: Schema.String,
  email: Schema.String,
  firstName: Schema.NullOr(Schema.String),
  lastName: Schema.NullOr(Schema.String),
});

/** What the Worker answers to a successful phone sign-in or refresh: the session plus the next refresh token. */
export const PhoneSession = Schema.Struct({
  accessToken: Schema.String,
  /** Unix time in milliseconds. */
  expiresAt: Schema.Number,
  user: User,
  method: Method,
  refreshToken: Schema.String,
});
export type PhoneSession = typeof PhoneSession.Type;
export type SessionUser = typeof User.Type;
export type SignInMethod = typeof Method.Type;

export const VerificationFailure = Schema.Struct({
  error: Schema.Literal("invalid_code", "invalid_transaction"),
});

/** A rejected email code, worded as on web. An expired or replaced code needs a new one, not a retry. */
export class EmailVerificationError extends Error {
  readonly code: typeof VerificationFailure.Type.error;
  constructor(code: typeof VerificationFailure.Type.error) {
    super(
      code === "invalid_transaction"
        ? "That code has expired. Send a new one."
        : "That code didn't work. Check it and try again.",
    );
    this.name = "EmailVerificationError";
    this.code = code;
  }
}

/** The person closed the sign-in window, the provider refused, or the returning link did not match. */
export class SignInIncompleteError extends Error {
  constructor() {
    super("Sign-in wasn't completed. Try again.");
    this.name = "SignInIncompleteError";
  }
}
