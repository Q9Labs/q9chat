import { ConvexReactClient } from "convex/react";

const requireBrowserValue = (key: "VITE_CONVEX_URL"): string => {
  const value: unknown = import.meta.env[key];
  if (typeof value !== "string" || value === "") {
    throw new Error(`${key} must be set for the web app`);
  }
  return value;
};

// Convex's WebSocket client appends /api/... directly; a trailing slash breaks the path.
export const convexClient = new ConvexReactClient(
  new URL(requireBrowserValue("VITE_CONVEX_URL")).origin,
);
