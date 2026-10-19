import { useConvexConnectionState } from "convex/react";
import { useEffect, useState } from "react";

/** A reconnect shorter than this does not flash the offline line. */
const OFFLINE_AFTER_MS = 2_000;

/** True once the live connection to Convex has been down for a couple of seconds, and false again the moment it is back. */
export function useOffline(): boolean {
  const { isWebSocketConnected } = useConvexConnectionState();
  const [downLongEnough, setDownLongEnough] = useState(false);
  useEffect(() => {
    const timer = setTimeout(
      () => setDownLongEnough(!isWebSocketConnected),
      isWebSocketConnected ? 0 : OFFLINE_AFTER_MS,
    );
    return () => clearTimeout(timer);
  }, [isWebSocketConnected]);
  return downLongEnough && !isWebSocketConnected;
}
