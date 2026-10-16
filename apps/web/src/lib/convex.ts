import { useAuth } from "@workos-inc/authkit-react";
import { ConvexReactClient } from "convex/react";
import { useCallback, useMemo } from "react";

const requireBrowserValue = (key: "VITE_CONVEX_URL" | "VITE_WORKOS_CLIENT_ID"): string => {
  const value: unknown = import.meta.env[key];
  if (typeof value !== "string" || value === "") {
    throw new Error(`${key} must be set for the web app`);
  }
  return value;
};

export const workosClientId = requireBrowserValue("VITE_WORKOS_CLIENT_ID");

// Convex's WebSocket client appends /api/... directly; a trailing slash breaks the path.
export const convexClient = new ConvexReactClient(
  new URL(requireBrowserValue("VITE_CONVEX_URL")).origin,
);

// Hands Convex the WorkOS access token so every query and mutation runs as
// the signed-in person.
export function useWorkosAuthForConvex() {
  const { isLoading, user, getAccessToken } = useAuth();
  const isAuthenticated = user !== null;

  const fetchAccessToken = useCallback(
    async ({ forceRefreshToken }: { forceRefreshToken: boolean }): Promise<string | null> => {
      if (!isAuthenticated) {
        return null;
      }
      return await getAccessToken({ forceRefresh: forceRefreshToken });
    },
    [isAuthenticated, getAccessToken],
  );

  return useMemo(
    () => ({ isLoading, isAuthenticated, fetchAccessToken }),
    [isLoading, isAuthenticated, fetchAccessToken],
  );
}
