import { Schema } from "effect";

export const Method = Schema.Literal("email", "google", "apple");
const User = Schema.Struct({
  id: Schema.String,
  email: Schema.String,
  firstName: Schema.NullOr(Schema.String),
  lastName: Schema.NullOr(Schema.String),
});
export const Session = Schema.Struct({
  accessToken: Schema.String,
  expiresAt: Schema.Number,
  user: User,
  method: Method,
});
export type Session = typeof Session.Type;
export const Email = Schema.String.pipe(
  Schema.maxLength(254),
  Schema.pattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/),
);
export const Code = Schema.String.pipe(Schema.pattern(/^\d{6}$/));
export const Client = Schema.Literal("web", "phone");
export const Nonempty = Schema.String.pipe(Schema.minLength(1), Schema.maxLength(4096));
export const RefreshInput = Schema.Struct({ refreshToken: Schema.optional(Nonempty) });
