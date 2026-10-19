/**
 * Where a screen with a Convex write stands. A Convex mutation never fails because the socket is
 * down: it stays queued and goes out when the connection is back. So during an outage a write
 * cannot be told from a slow one, and giving up on waiting is not cancelling it.
 */
export type WriteStand =
  /** Connected, nothing out: the write may start. */
  | "ready"
  /** Not connected, nothing out: say so instead of queueing a write the person cannot watch. */
  | "offline"
  /** Connected, a write is out: it ends soon, so the screen holds on to the person. */
  | "locked"
  /** Not connected, a write is out: it may finish later, so the person may leave after being told so. */
  | "waiting";

/** What a form says when it is asked to send a write while the connection is down. */
export const OFFLINE_NOTICE = "You're offline. Try again when you're back online.";

export function standOf(connected: boolean, pending: boolean): WriteStand {
  if (pending) return connected ? "locked" : "waiting";
  return connected ? "ready" : "offline";
}

type WriteEnd<T> = { stale: boolean } & ({ ok: true; value: T } | { ok: false; error: unknown });

/**
 * Runs writes for one screen and says how each one ended. An end is `stale` when the person
 * acknowledged an exit after it started, and a stale write must not move the screen anywhere.
 */
export function createWriteRun() {
  let turn = 0;
  return {
    async run<T>(write: () => Promise<T>): Promise<WriteEnd<T>> {
      turn += 1;
      const mine = turn;
      try {
        const value = await write();
        return { stale: mine !== turn, ok: true, value };
      } catch (error) {
        return { stale: mine !== turn, ok: false, error };
      }
    },
    /** The person answered or left: every write started before now is over as far as the screen goes. */
    supersede() {
      turn += 1;
    },
  };
}
