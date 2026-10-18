import { Either, Schema } from "effect";

import { workosConfig } from "./workos.server.js";

export function cookie(request: Request, name: string) {
  return request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}
export function setCookie(name: string, value: string, maxAge: number) {
  return `${name}=${value}; HttpOnly; Secure; SameSite=Lax; Path=/api/auth; Max-Age=${maxAge}`;
}
function base64(data: Uint8Array) {
  return btoa(String.fromCharCode(...data))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}
export function randomToken() {
  return base64(crypto.getRandomValues(new Uint8Array(32)));
}
export async function challenge(verifier: string) {
  return base64(
    new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))),
  );
}
async function signingKey() {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(workosConfig().WORKOS_API_KEY),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}
export async function seal(value: object) {
  const payload = base64(new TextEncoder().encode(JSON.stringify(value)));
  const signature = await crypto.subtle.sign(
    "HMAC",
    await signingKey(),
    new TextEncoder().encode(payload),
  );
  return `${payload}.${base64(new Uint8Array(signature))}`;
}
function bytes(value: string) {
  return Uint8Array.from(atob(value.replaceAll("-", "+").replaceAll("_", "/")), (char) =>
    char.charCodeAt(0),
  );
}
export async function unseal<A, I>(
  value: string | undefined,
  schema: Schema.Schema<A, I>,
): Promise<A | null> {
  if (!value) return null;
  try {
    const [payload, signature] = value.split(".");
    if (
      !payload ||
      !signature ||
      !(await crypto.subtle.verify(
        "HMAC",
        await signingKey(),
        bytes(signature),
        new TextEncoder().encode(payload),
      ))
    )
      return null;
    const parsed = Schema.decodeUnknownEither(Schema.parseJson(schema))(
      new TextDecoder().decode(bytes(payload)),
    );
    return Either.isRight(parsed) ? parsed.right : null;
  } catch {
    return null;
  }
}

export const transactionCookies = ["q9_email", "q9_oauth", "q9_phone"];
const SignInTransaction = Schema.Struct({ subject: Schema.String, expiresAt: Schema.Number });
export async function beginTransaction(name: string, subject: string) {
  return setCookie(name, await seal({ subject, expiresAt: Date.now() + 600_000 }), 600);
}
export async function hasTransaction(request: Request, name: string, subject: string) {
  const transaction = await unseal(cookie(request, name), SignInTransaction);
  return (
    transaction !== null && transaction.expiresAt > Date.now() && transaction.subject === subject
  );
}
