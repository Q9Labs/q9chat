import type { ConvexReactClient } from "convex/react";

/**
 * One Convex client per signed-in session. Convex keeps a mutation that was sent while the phone was
 * offline and sends it again on reconnect under whatever auth the client holds then, so a name saved
 * offline by one account could land on the next. Closing the client when its session ends drops that queue.
 */
export function createClientHolder(newClient: () => ConvexReactClient) {
  let held = { epoch: 0, client: newClient() };
  /** Clients of ended sessions, closed once React has finished with them. */
  const retired: ConvexReactClient[] = [];
  return {
    clientFor(epoch: number) {
      if (held.epoch !== epoch) {
        retired.push(held.client);
        held = { epoch, client: newClient() };
      }
      return held.client;
    },
    closeRetired() {
      for (const old of retired.splice(0)) void old.close();
    },
  };
}
