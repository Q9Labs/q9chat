import { useEffect, useState } from "react";

import { Toast } from "../ui/overlay.js";

export function OAuthArrival({
  method,
  arrival,
}: {
  readonly method: string | null;
  readonly arrival: boolean;
}) {
  const [message] = useState(() => {
    if (!arrival) return "";
    const provider = method === "google" ? "Google" : method === "apple" ? "Apple" : null;
    return provider ? `Signed in with ${provider}` : "";
  });
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.delete("signedIn");
    window.history.replaceState(window.history.state, "", url);
    const timer = window.setTimeout(() => setVisible(false), 4000);
    return () => window.clearTimeout(timer);
  }, []);
  return message && visible ? <Toast message={message} /> : null;
}
