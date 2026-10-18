import { api } from "@q9chat/convex";
import { useMutation } from "convex/react";
import type { FunctionArgs } from "convex/server";
import { useCallback, useEffect, useRef, useState } from "react";

import { journeyError } from "./group-errors.js";

export function useSenderTyping(groupId: FunctionArgs<typeof api.typing.start>["groupId"]) {
  const start = useMutation(api.typing.start);
  const stop = useMutation(api.typing.stop);
  const last = useRef<number | null>(null);
  const [error, setError] = useState("");
  const clear = useCallback(() => {
    if (last.current === null) return;
    last.current = null;
    void stop({ groupId }).catch((cause: unknown) => setError(journeyError(cause)));
  }, [groupId, stop]);
  useEffect(() => clear, [clear]);
  return {
    error,
    clear,
    change: (value: string) => {
      if (!value.trim()) return clear();
      const now = Date.now();
      if (last.current !== null && now - last.current < 3000) return;
      last.current = now;
      void start({ groupId }).catch((cause: unknown) => setError(journeyError(cause)));
    },
  };
}
