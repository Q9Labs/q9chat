import { ConvexProviderWithAuth } from "convex/react";
import { useLayoutEffect, useState, type ReactNode } from "react";
// react-doctor-disable-next-line react-doctor/no-flush-sync -- Detach SDK effects before synchronous transport disposal can change the authenticated caller.
import { flushSync } from "react-dom";

import { accountConvexClient, beforeTransportClose } from "./convex.js";
import { useSession } from "./session.js";

/** Detach SDK hooks before disposal; the parent sign-in/sign-out shell stays mounted. */
export function AccountTransport({ children }: { readonly children: ReactNode }) {
  const [client] = useState(accountConvexClient);
  const [retiring, setRetiring] = useState(false);
  useLayoutEffect(
    () =>
      beforeTransportClose(client, () => {
        flushSync(() => setRetiring(true));
      }),
    [client],
  );
  if (retiring) return <output className="center">Loading…</output>;
  return (
    /* oxlint-disable-next-line react/rules-of-hooks -- ConvexProviderWithAuth takes the auth hook and calls it as a hook itself. */
    <ConvexProviderWithAuth client={client} useAuth={useSession}>
      {children}
    </ConvexProviderWithAuth>
  );
}
