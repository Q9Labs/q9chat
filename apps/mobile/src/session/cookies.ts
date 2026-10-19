/** Sign-in transaction cookies the Worker sets; the phone keeps them itself because its requests carry no cookie jar. */
const TRANSACTION = /(?:^|[,;]\s*)(q9_email|q9_phone)=([^;,\s]*)/g;

export type Jar = Map<string, string>;

/** Applies a Set-Cookie header to the jar: a value is stored, an empty one (Max-Age=0) removes the cookie. */
export function applySetCookie(jar: Jar, header: string | null) {
  for (const [, name, value] of (header ?? "").matchAll(TRANSACTION)) {
    if (!name) continue;
    if (value) jar.set(name, value);
    else jar.delete(name);
  }
}

/** The Cookie request header for the cookies the jar holds, or undefined when it is empty. */
export function cookieHeader(jar: Jar): string | undefined {
  return jar.size ? [...jar].map(([name, value]) => `${name}=${value}`).join("; ") : undefined;
}
