import { useEffect, useState } from "react";
import { AppState } from "react-native";

import { msUntilMidnight } from "./groupRows";

/** The current time, refreshed when the app returns to the foreground and at each local midnight, so day labels never go stale. */
export function useToday(): Date {
  const [today, setToday] = useState(() => new Date());
  useEffect(() => {
    const timer = setTimeout(() => setToday(new Date()), msUntilMidnight(today) + 1_000);
    return () => clearTimeout(timer);
  }, [today]);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (status) => {
      if (status === "active") setToday(new Date());
    });
    return () => subscription.remove();
  }, []);
  return today;
}
