import { api } from "@q9chat/convex";
import { useConvex, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useEffect, useState } from "react";

import { groupError, MAX_QUERY, pairCandidate, pickerHint, pickerLimit } from "./groupRules";

export type Found = FunctionReturnType<typeof api.people.find>[number];

const DEBOUNCE_MS = 200;

/** `value`, but only once it has stopped changing for a moment. */
function useDebounced(value: string) {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [value]);
  return settled;
}

/** Whether the person already has a group of two with `profileId`: its id, null for none, undefined while asking. */
function usePairWith(profileId: Found["id"] | null) {
  const client = useConvex();
  const [answer, setAnswer] = useState<{
    profileId: Found["id"];
    groupId: string | null;
    problem: string | null;
  }>();
  useEffect(() => {
    let current = true;
    if (profileId !== null)
      client.query(api.groups.pairWith, { profileId }).then(
        (groupId) => current && setAnswer({ profileId, groupId, problem: null }),
        (error: unknown) =>
          current && setAnswer({ profileId, groupId: null, problem: groupError(error, 1) }),
      );
    return () => {
      current = false;
    };
  }, [client, profileId]);
  return answer?.profileId === profileId ? answer : undefined;
}

/** Who `people.find` knows for what was typed. While the field has moved on from what was searched, nothing is offered. */
function useMatches(query: string) {
  const settled = useDebounced(query);
  const trimmed = settled.trim();
  const found = useQuery(
    api.people.find,
    trimmed && trimmed.length <= MAX_QUERY ? { query: trimmed } : "skip",
  );
  return query === settled ? found : undefined;
}

/**
 * The people field of New group and Add people: what was typed, who is chosen, who can be
 * suggested, what to say under the field, and whether a name-less single pick is a pair that exists.
 * `members` are people already in the group (Add people) who must not be suggested again.
 */
export function usePeoplePicker({
  mode,
  name,
  ownEmail,
  members,
}: {
  mode: "create" | "add";
  name: string;
  ownEmail: string;
  members: readonly string[];
}) {
  const [query, setQuery] = useState("");
  const [people, setPeople] = useState<readonly Found[]>([]);
  const [limit, setLimit] = useState<string | null>(null);
  const matches = useMatches(query);
  const chosen = new Set([...people.map((person) => person.id), ...members]);
  const suggestions = (matches ?? []).filter((person) => !chosen.has(person.id));
  const pair = usePairWith(mode === "create" ? pairCandidate(name, people) : null);

  return {
    query,
    setQuery,
    people,
    suggestions,
    hint: pickerHint(query, ownEmail, matches, people.length),
    /** The id of the pair that exists, null when there is none, undefined while that is being asked or when no pair is in play. */
    pairGroupId: pair?.groupId,
    problem: pair?.problem ?? limit,
    pick: (id: string) => {
      const person = suggestions.find((match) => match.id === id);
      if (!person) return;
      const over = pickerLimit(mode, people.length + 1);
      setLimit(over);
      if (over) return;
      setPeople([...people, person]);
      setQuery("");
    },
    unpick: (id: string) => {
      setLimit(null);
      setPeople(people.filter((person) => person.id !== id));
    },
  };
}
