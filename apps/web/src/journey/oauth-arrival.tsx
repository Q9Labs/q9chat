import { useEffect, useState } from "react";

import { Toast } from "../ui/overlay.js";
import { clearOAuthArrival, oauthArrivalMessage } from "./oauth.js";

export function OAuthArrival({ method }: { readonly method: string | null }) {
  const [message] = useState(() => oauthArrivalMessage(method));
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    clearOAuthArrival();
    const timer = window.setTimeout(() => setVisible(false), 4000);
    return () => window.clearTimeout(timer);
  }, []);
  return message && visible ? <Toast message={message} /> : null;
}
