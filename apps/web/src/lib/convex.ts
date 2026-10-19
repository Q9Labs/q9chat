import { ConvexReactClient } from "convex/react";

const requireBrowserValue = (key: "VITE_CONVEX_URL"): string => {
  const value: unknown = import.meta.env[key];
  if (typeof value !== "string" || value === "") {
    throw new Error(`${key} must be set for the web app`);
  }
  return value;
};

// Convex's WebSocket client appends /api/... directly; a trailing slash breaks the path.
export const convexUrl = new URL(requireBrowserValue("VITE_CONVEX_URL")).origin;
const detached = () => {};
let current: { client: ConvexReactClient; lifetime: AbortController; detach: () => void } | null =
  null;
const lifetimes = new WeakMap<ConvexReactClient, AbortSignal>();

export function accountConvexClient() {
  if (!current) {
    const client = new ConvexReactClient(convexUrl);
    const lifetime = new AbortController();
    current = { client, lifetime, detach: detached };
    lifetimes.set(client, lifetime.signal);
  }
  return current.client;
}

export function transportLifetime(client: ConvexReactClient) {
  const signal = lifetimes.get(client);
  if (!signal) throw new Error("Missing account transport lifetime");
  return signal;
}

export function beforeTransportClose(client: ConvexReactClient, detach: () => void) {
  if (current?.client !== client) throw new Error("Missing active account transport");
  current.detach = detach;
  return () => {
    if (current?.client === client) current.detach = detached;
  };
}

/** Retire queued mutations before HTTP authentication can change their caller. */
export async function retireAccountTransport() {
  const previous = current;
  current = null;
  if (previous) {
    previous.detach();
    previous.lifetime.abort();
    await previous.client.close();
  }
}
