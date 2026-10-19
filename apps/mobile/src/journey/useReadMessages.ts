import { api, type Id } from "@q9chat/convex";
import { useConvexConnectionState, useMutation } from "convex/react";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";

import { type ReadProgress, observeReadProgress, flushReadProgress } from "./readProgress";

export function useReadMessages(groupId: Id<"groups">, initialRead: number, visible: number) {
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(AppState.currentState === "active");
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => setActive(state === "active"));
    return () => sub.remove();
  }, []);
  const { isWebSocketConnected } = useConvexConnectionState();
  const markRead = useMutation(api.readStates.markRead);
  const progress = useRef<ReadProgress>({
    seen: initialRead,
    saved: initialRead,
    connected: false,
    saving: false,
  });
  const [error, setError] = useState("");
  useEffect(() => {
    const current = progress.current;
    const reconnected = !current.connected && isWebSocketConnected;
    current.connected = isWebSocketConnected;
    observeReadProgress(current, visible, focused && active);
    if (error && !reconnected) return;
    const saving = flushReadProgress(current, (sequence) => markRead({ groupId, sequence }));
    if (saving)
      void saving
        .then(() => setError(""))
        .catch(() => setError("Couldn't save your place. Try again."));
  }, [active, focused, groupId, isWebSocketConnected, markRead, visible, error]);
  return { error, retry: () => setError(""), visible: focused && active };
}
