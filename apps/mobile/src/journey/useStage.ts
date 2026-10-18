import { api } from "@q9chat/convex";
import { useConvexAuth, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";

import { type Session, useSessionState } from "../session/client";

type ProfileResult = NonNullable<FunctionReturnType<typeof api.profiles.me>>;
export type ReadyProfile = Extract<ProfileResult, { status: "ready" }>["profile"];

/** Where the person is in journey 1: the one place the session, Convex and the profile are read together. */
export type Stage =
  | { kind: "loading" }
  | { kind: "signedOut" }
  | { kind: "unavailable" }
  | { kind: "needsSetup"; session: Session }
  | { kind: "ready"; session: Session; profile: ReadyProfile };

export function useStage(): Stage {
  const state = useSessionState();
  const { isLoading, isAuthenticated } = useConvexAuth();
  // Signed out, or Convex has not accepted the token yet: skip the query, it would answer null.
  const me = useQuery(
    api.profiles.me,
    state.status === "authenticated" && isAuthenticated ? {} : "skip",
  );
  if (state.status === "loading") return { kind: "loading" };
  if (state.status === "unauthenticated") return { kind: "signedOut" };
  if (isLoading) return { kind: "loading" };
  if (!isAuthenticated) return { kind: "unavailable" };
  return profileStage(state.session, me);
}

function profileStage(session: Session, me: ProfileResult | null | undefined): Stage {
  if (me === undefined) return { kind: "loading" };
  if (me === null || me.status === "unavailable") return { kind: "unavailable" };
  if (me.status === "needsSetup") return { kind: "needsSetup", session };
  return { kind: "ready", session, profile: me.profile };
}
