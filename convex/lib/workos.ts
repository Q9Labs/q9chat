import { Data, Effect, Schedule, Schema } from "effect";
export class ServiceError extends Data.TaggedError("ServiceError")<{
  operation: string;
  status: number;
  detail: string;
}> {}
const User = Schema.Struct({
  id: Schema.String,
  email: Schema.String,
  email_verified: Schema.Boolean,
  first_name: Schema.NullOr(Schema.String),
  last_name: Schema.NullOr(Schema.String),
});
export function request(operation: string, url: string, init: RequestInit) {
  return Effect.tryPromise({
    try: () => fetch(url, { ...init, redirect: "error", signal: AbortSignal.timeout(10000) }),
    catch: () => new ServiceError({ operation, status: 0, detail: "Network request failed" }),
  }).pipe(
    Effect.flatMap((response) =>
      response.ok || response.status === 404
        ? Effect.succeed(response)
        : Effect.fail(
            new ServiceError({
              operation,
              status: response.status,
              detail: "Provider rejected request",
            }),
          ),
    ),
    Effect.retry({
      schedule: Schedule.exponential("100 millis"),
      times: 2,
      while: (error) => error.status === 0 || error.status >= 500,
    }),
  );
}
function headers() {
  const key = process.env["WORKOS_API_KEY"];
  if (!key)
    return Effect.fail(
      new ServiceError({
        operation: "workos",
        status: 0,
        detail: "WORKOS_API_KEY is not configured",
      }),
    );
  return Effect.succeed({ Authorization: `Bearer ${key}` });
}
export const getUser = (id: string) =>
  Effect.gen(function* () {
    const auth = yield* headers();
    const response = yield* request(
      "get WorkOS user",
      `https://api.workos.com/user_management/users/${encodeURIComponent(id)}`,
      { headers: auth },
    );
    if (response.status === 404)
      return yield* Effect.fail(
        new ServiceError({ operation: "get WorkOS user", status: 404, detail: "User not found" }),
      );
    const body = yield* Effect.tryPromise({
      try: () => response.json(),
      catch: () =>
        new ServiceError({ operation: "get WorkOS user", status: 0, detail: "Invalid JSON" }),
    });
    return yield* Schema.decodeUnknown(User)(body).pipe(
      Effect.mapError(
        () => new ServiceError({ operation: "get WorkOS user", status: 0, detail: "Invalid user" }),
      ),
    );
  });
export const deleteUser = (id: string) =>
  Effect.gen(function* () {
    const auth = yield* headers();
    yield* request(
      "delete WorkOS user",
      `https://api.workos.com/user_management/users/${encodeURIComponent(id)}`,
      { method: "DELETE", headers: auth },
    );
  });
