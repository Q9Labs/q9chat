import { ConvexHttpClient } from "convex/browser";

import { sessionClient } from "../session/client";
import { config } from "../session/config";

/** A bounded write cannot wait in the socket queue and replay after sign-out. */
export async function phoneWrite<T>(write: (client: ConvexHttpClient) => Promise<T>): Promise<T> {
  const epoch = sessionClient.epoch();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  const unsubscribe = sessionClient.subscribe(() => {
    if (sessionClient.epoch() !== epoch) controller.abort();
  });
  try {
    const token = await sessionClient.fetchAccessToken({ forceRefreshToken: false });
    if (!token || controller.signal.aborted || sessionClient.epoch() !== epoch)
      throw new Error("Sign in again to continue.");
    const client = new ConvexHttpClient(config.convexUrl, {
      auth: token,
      logger: false,
      fetch: (input, init) => fetch(input, { ...init, signal: controller.signal }),
    });
    const result = await write(client);
    if (sessionClient.epoch() !== epoch) throw new Error("Session changed.");
    return result;
  } finally {
    clearTimeout(timeout);
    unsubscribe();
  }
}
