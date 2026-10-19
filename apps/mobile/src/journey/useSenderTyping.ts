import { api } from "@q9chat/convex";
import { useConvexConnectionState, useMutation } from "convex/react";
import type { FunctionArgs } from "convex/server";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";

/** Typing is transient; never send a new indicator while disconnected or covered. */
export function useSenderTyping(groupId: FunctionArgs<typeof api.typing.start>["groupId"]) {
  const start = useMutation(api.typing.start);
  const stop = useMutation(api.typing.stop);
  const { isWebSocketConnected: connected } = useConvexConnectionState();
  const [error, setError] = useState("");
  const last = useRef<number | null>(null);
  const clear = useCallback(() => {
    if (last.current === null) return;
    last.current = null;
    // An offline indicator expires server-side. A stop must not queue behind future typing.
    if (connected)
      void stop({ groupId }).then(
        () => setError(""),
        () => setError("Couldn't update typing. Your messages can still send."),
      );
  }, [connected, groupId, stop]);
  useFocusEffect(useCallback(() => clear, [clear]));
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") clear();
    });
    return () => subscription.remove();
  }, [clear]);
  return {
    clear,
    error,
    change(text: string) {
      if (!text.trim()) return clear();
      if (!connected || AppState.currentState !== "active") return;
      const now = Date.now();
      if (last.current !== null && now - last.current < 3000) return;
      last.current = now;
      // Typing expires after inactivity; a failed presence update never blocks a message.
      void start({ groupId }).then(
        () => setError(""),
        () => setError("Couldn't update typing. Your messages can still send."),
      );
    },
  };
}
