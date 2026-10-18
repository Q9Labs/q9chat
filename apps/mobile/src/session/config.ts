// Expo inlines EXPO_PUBLIC_* only for direct `process.env.NAME` reads, so each one is read by name.
function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Set ${name} in apps/mobile/.env (see .env.example)`);
  return value;
}

const convexUrl = required("EXPO_PUBLIC_CONVEX_URL", process.env.EXPO_PUBLIC_CONVEX_URL);

export const config = {
  convexUrl,
  siteUrl:
    process.env.EXPO_PUBLIC_CONVEX_SITE_URL ??
    convexUrl.replace(/\.convex\.cloud$/u, ".convex.site"),
  authOrigin: required("EXPO_PUBLIC_AUTH_ORIGIN", process.env.EXPO_PUBLIC_AUTH_ORIGIN),
  workosClientId: required(
    "EXPO_PUBLIC_WORKOS_CLIENT_ID",
    process.env.EXPO_PUBLIC_WORKOS_CLIENT_ID,
  ),
};
