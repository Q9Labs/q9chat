import { api, type Id } from "@q9chat/convex";
import { useConvexConnectionState, useMutation } from "convex/react";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";

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
  const highWater = useRef(initialRead);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (
      error ||
      !focused ||
      !active ||
      !isWebSocketConnected ||
      saving ||
      visible <= highWater.current
    )
      return;
    setSaving(true);
    void markRead({ groupId, sequence: visible })
      .then(() => {
        highWater.current = Math.max(highWater.current, visible);
        setError("");
      })
      .catch(() => setError("Couldn't save your place. Try again."))
      .finally(() => {
        setSaving(false);
      });
  }, [active, focused, groupId, isWebSocketConnected, markRead, visible, saving, error]);
  return { error, retry: () => setError(""), visible: focused && active };
}
