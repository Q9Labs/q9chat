import { useCallback, useEffect } from "react";

import type { createSessionClient } from "../session/core.ts";

type Session = ReturnType<typeof createSessionClient>;

/**
 * The join route hands its invite to the sign-in it starts (the sign-in screen passes it on), so
 * OAuth or a killed app can still arrive at it. The invite is dropped when the route goes away
 * (Back, the gesture) and when sign-in is done, because from then on the route holds the token itself.
 */
export function useSavedInvite(
  invite: string | undefined,
  ready: boolean,
  session: Pick<Session, "forgetInvite">,
) {
  // A delete that fails leaves the invite with the sign-in it was started for, and with no other.
  const forget = useCallback(() => {
    if (invite) session.forgetInvite(invite).catch(() => {});
  }, [invite, session]);
  useEffect(() => forget, [forget]);
  useEffect(() => {
    if (ready) forget();
  }, [ready, forget]);
}
