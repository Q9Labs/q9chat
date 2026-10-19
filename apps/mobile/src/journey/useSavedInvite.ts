import { useEffect } from "react";

import type { createSessionClient } from "../session/core.ts";

type Session = ReturnType<typeof createSessionClient>;

/**
 * Keeps a join link's invite while its route waits for sign-in, so OAuth or a killed app can still
 * arrive at it. It is dropped when the route goes away (Back, the gesture) and when sign-in is done,
 * because from then on the route holds the token itself.
 */
export function useSavedInvite(
  invite: string | undefined,
  ready: boolean,
  session: Pick<Session, "rememberInvite" | "forgetInvite">,
) {
  useEffect(() => {
    const waiting = ready ? undefined : invite;
    // A save that fails only loses the invite if the app is killed; the route still has the token.
    if (waiting) session.rememberInvite(waiting).catch(() => {});
    return () => {
      // A delete that fails leaves it for under ten minutes; sign-out refuses to finish while it cannot be deleted.
      if (waiting) session.forgetInvite(waiting).catch(() => {});
    };
  }, [invite, ready, session]);
}
