import { env } from "cloudflare:workers";

declare global {
  namespace Cloudflare {
    interface Env {
      AUTH_START_IP: RateLimit;
      AUTH_START_EMAIL: RateLimit;
      AUTH_VERIFY_IP: RateLimit;
      AUTH_VERIFY_EMAIL: RateLimit;
    }
  }
}

export async function emailBudget(request: Request, email: string, action: "start" | "verify") {
  // Cloudflare overwrites this header at the edge. Never trust X-Forwarded-For.
  const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
  const ipLimiter = action === "start" ? env.AUTH_START_IP : env.AUTH_VERIFY_IP;
  if (!(await ipLimiter.limit({ key: ip })).success) return false;
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(email.trim().toLowerCase()),
  );
  const key = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
  const emailLimiter = action === "start" ? env.AUTH_START_EMAIL : env.AUTH_VERIFY_EMAIL;
  return (await emailLimiter.limit({ key })).success;
}
