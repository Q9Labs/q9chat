import { api } from "@q9chat/convex";
import { useConvexAuth, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";

import { type Session, useSessionState } from "../session/client";
import { useOffline } from "./useOffline";

type ProfileResult = NonNullable<FunctionReturnType<typeof api.profiles.me>>;
export type ReadyProfile = Extract<ProfileResult, { status: "ready" }>["profile"];

/** Where the person is in journey 1: the one place the session, Convex and the profile are read together. */
export type Stage =
  | { kind: "loading" }
  | { kind: "signedOut" }
  | { kind: "unavailable" }
  | { kind: "offline" }
  /** The account is still being read and the live connection is down. */
  | { kind: "disconnected" }
  | { kind: "needsSetup"; session: Session }
  | { kind: "ready"; session: Session; profile: ReadyProfile };

/** The stage for every session status that has no account to look at yet. */
const WITHOUT_ACCOUNT = {
  loading: { kind: "loading" },
  unauthenticated: { kind: "signedOut" },
  offline: { kind: "offline" },
} as const;

export function useStage(): Stage {
  const state = useSessionState();
  const { isLoading, isAuthenticated } = useConvexAuth();
  const waiting: Stage = useOffline() ? { kind: "disconnected" } : { kind: "loading" };
  // Signed out, or Convex has not accepted the token yet: skip the query, it would answer null.
  const me = useQuery(
    api.profiles.me,
    state.status === "authenticated" && isAuthenticated ? {} : "skip",
  );
  if (state.status !== "authenticated") return WITHOUT_ACCOUNT[state.status];
  if (isLoading) return waiting;
  if (!isAuthenticated) return { kind: "unavailable" };
  return profileStage(state.session, me, waiting);
}

function profileStage(
  session: Session,
  me: ProfileResult | null | undefined,
  waiting: Stage,
): Stage {
  if (me === undefined) return waiting;
  if (me === null || me.status === "unavailable") return { kind: "unavailable" };
  if (me.status === "needsSetup") return { kind: "needsSetup", session };
  return { kind: "ready", session, profile: me.profile };
}
