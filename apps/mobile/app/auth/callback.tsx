import { Redirect, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";

import { Loading } from "../../src/journey/Loading";
import { postNotice } from "../../src/journey/notice";
import { sessionClient } from "../../src/session/client";

/**
 * The Worker's phone-callback page sends the browser to q9chat://auth/callback?code&state. On iOS the auth
 * session takes that link itself; here it arrives from Android, or from a browser opened by hand.
 */
export default function AuthCallbackRoute() {
  const { code, state } = useLocalSearchParams<{ code?: string; state?: string }>();
  const [outcome, setOutcome] = useState<"pending" | "signedIn" | "failed">("pending");
  useEffect(() => {
    let live = true;
    void sessionClient
      .finishOAuth(code && state ? { code, state } : null)
      .then(
        () => "signedIn" as const,
        () => "failed" as const,
      )
      .then((result) => {
        if (live) setOutcome(result);
      });
    return () => {
      live = false;
    };
  }, [code, state]);
  if (outcome === "pending") return <Loading />;
  if (outcome === "failed") return <Redirect href="/?authError=1" />;
  postNotice("Signed in");
  return <Redirect href="/" />;
}
