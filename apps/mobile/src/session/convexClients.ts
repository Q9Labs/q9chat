import type { ConvexReactClient } from "convex/react";
import { useEffect, useSyncExternalStore } from "react";

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

/**
 * The provider's client: the one for the current session epoch. Convex's provider clears the old client's auth in its own effect cleanup, which runs before this effect, so a client closed any earlier throws there.
 */
export function useEpochClient(
  session: {
    subscribe: (listener: () => void) => () => void;
    epoch: () => number;
  },
  clients: ReturnType<typeof createClientHolder>,
) {
  const epoch = useSyncExternalStore(session.subscribe, session.epoch);
  const client = clients.clientFor(epoch);
  useEffect(() => {
    clients.closeRetired();
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- the effect runs when the client is replaced, so it reads no value from it
  }, [client, clients]);
  return client;
}
