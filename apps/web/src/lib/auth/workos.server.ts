import { env } from "cloudflare:workers";
import { Data, Effect, Either, Schedule, Schema } from "effect";

const Config = Schema.Struct({ WORKOS_API_KEY: Schema.String, WORKOS_CLIENT_ID: Schema.String });
export function workosConfig() {
  return Schema.decodeUnknownSync(Config)(env);
}

export class WorkosError extends Data.TaggedError("WorkosError")<{
  status: number;
  code: string;
}> {}
const ErrorBody = Schema.Struct({
  code: Schema.optional(Schema.String),
  error: Schema.optional(Schema.String),
});

export async function workos<A, I>(
  path: string,
  body: object,
  schema: Schema.Schema<A, I>,
  retry: "never" | "idempotent" = "never",
) {
  const { WORKOS_API_KEY } = workosConfig();
  const request = Effect.tryPromise({
    try: async (signal) => {
      const response = await fetch(`https://api.workos.com/user_management/${path}`, {
        method: "POST",
        signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]),
        headers: { Authorization: `Bearer ${WORKOS_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (response.status >= 500)
        throw new WorkosError({ status: response.status, code: "upstream_error" });
      if (!response.ok) {
        const parsed = Schema.decodeUnknownEither(ErrorBody)(await response.json());
        throw new WorkosError({
          status: response.status,
          code: Either.isRight(parsed)
            ? (parsed.right.code ?? parsed.right.error ?? "upstream_error")
            : "upstream_error",
        });
      }
      const text = await response.text();
      return text === ""
        ? undefined
        : Schema.decodeUnknownSync(Schema.parseJson(Schema.Unknown))(text);
    },
    catch: (error) =>
      error instanceof WorkosError ? error : new WorkosError({ status: 503, code: "unavailable" }),
  }).pipe(
    Effect.retry({
      times: 2,
      schedule: Schedule.exponential("200 millis"),
      while: (error) =>
        retry === "idempotent" && error.status >= 500 && error.code !== "unavailable",
    }),
    Effect.flatMap((value) => Schema.decodeUnknown(schema)(value)),
    Effect.mapError((error) =>
      error instanceof WorkosError
        ? error
        : new WorkosError({ status: 502, code: "invalid_response" }),
    ),
  );
  const result = await Effect.runPromise(Effect.either(request));
  if (Either.isLeft(result)) throw result.left;
  return result.right;
}

const Authentication = Schema.Struct({
  access_token: Schema.String,
  refresh_token: Schema.String,
  authentication_method: Schema.optional(Schema.String),
  user: Schema.Struct({
    id: Schema.String,
    email: Schema.String,
    first_name: Schema.NullOr(Schema.String),
    last_name: Schema.NullOr(Schema.String),
  }),
});
const Claims = Schema.Struct({ exp: Schema.Number, iat: Schema.Number, sid: Schema.String });
// These tokens come directly from WorkOS over TLS, never from request input.
export function accessClaims(token: string) {
  const payload = token.split(".")[1];
  if (!payload) throw new WorkosError({ status: 502, code: "invalid_response" });
  return Schema.decodeUnknownSync(Claims)(
    JSON.parse(atob(payload.replaceAll("-", "+").replaceAll("_", "/"))),
  );
}
type AuthenticationInput =
  | { grant_type: "urn:workos:oauth:grant-type:magic-auth:code"; email: string; code: string }
  | { grant_type: "authorization_code"; code: string; code_verifier: string; redirect_uri: string }
  | { grant_type: "refresh_token"; refresh_token: string };

export async function authenticate(body: AuthenticationInput) {
  const { WORKOS_API_KEY, WORKOS_CLIENT_ID } = workosConfig();
  const auth = await workos(
    "authenticate",
    { client_id: WORKOS_CLIENT_ID, client_secret: WORKOS_API_KEY, ...body },
    Authentication,
  );
  const allowed =
    auth.authentication_method === "MagicAuth" ||
    auth.authentication_method === "GoogleOAuth" ||
    auth.authentication_method === "AppleOAuth";
  // Refresh responses may omit the method. In that case the signed session
  // already records an allowed method checked at the original authentication.
  if (
    !allowed &&
    !(body.grant_type === "refresh_token" && auth.authentication_method === undefined)
  ) {
    await workos(
      "sessions/revoke",
      { session_id: accessClaims(auth.access_token).sid },
      Schema.Unknown,
      "idempotent",
    );
    throw new WorkosError({ status: 403, code: "unsupported_method" });
  }
  return auth;
}
