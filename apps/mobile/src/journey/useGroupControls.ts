import { api, type Id } from "@q9chat/convex";
import { useConvexConnectionState, useMutation } from "convex/react";
import { useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";

import { groupError } from "./groupRules";
import { createWriteRun, OFFLINE_NOTICE } from "./pendingWrite";

type Notify = "all" | "mentions" | "muted";
const NOTICES = {
  muted: "Group muted",
  all: "Notifying for every message",
  mentions: "Notifying for mentions and replies",
};

/** One in-flight control write; leaving the pane cancels its UI continuation. */
export function useGroupControls(input: {
  groupId: Id<"groups">;
  showToast: (text: string) => void;
  closeSheet: () => void;
  onLeave: () => void;
}) {
  const { groupId, showToast, closeSheet, onLeave } = input;
  const setNotify = useMutation(api.groups.setNotify);
  const leave = useMutation(api.groups.leave);
  const remove = useMutation(api.groups.removeMember);
  const busy = useRef(false);
  const [phase, setPhase] = useState<"idle" | "saving">("idle");
  const [writes] = useState(createWriteRun);
  const { isWebSocketConnected } = useConvexConnectionState();
  useFocusEffect(
    useCallback(
      () => () => {
        writes.supersede();
      },
      [writes],
    ),
  );

  async function write(action: () => Promise<unknown>, done: () => void) {
    if (busy.current) return;
    if (!isWebSocketConnected) {
      showToast(OFFLINE_NOTICE);
      return;
    }
    busy.current = true;
    setPhase("saving");
    try {
      const end = await writes.run(action);
      if (end.stale) return;
      if (end.ok) {
        closeSheet();
        done();
      } else showToast(groupError(end.error));
    } finally {
      busy.current = false;
      setPhase("idle");
    }
  }
  return {
    pending: phase === "saving",
    chooseNotify: (notify: Notify) =>
      void write(
        () => setNotify({ groupId, notify }),
        () => showToast(NOTICES[notify]),
      ),
    removeMember: (person: { id: Id<"profiles">; name: string }) =>
      void write(
        () => remove({ groupId, profileId: person.id }),
        () => showToast(`Removed ${person.name}`),
      ),
    leave: () => void write(() => leave({ groupId }), onLeave),
  };
}
