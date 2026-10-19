import { api, type Id } from "@q9chat/convex";
import { useMutation } from "convex/react";
import * as Crypto from "expo-crypto";
import { Stack, useRouter, usePreventRemove } from "expo-router";
import { useRef, useState } from "react";

import { NewGroupScreen } from "../screens/NewGroupScreen";
import { config } from "../session/config";
import { groupError, newInviteToken, pairCandidate, type Phase } from "./groupRules";
import { livePerson } from "./livePeople";
import { postNotice } from "./notice";
import { useCopied } from "./useCopied";
import { type Found, usePeoplePicker } from "./usePeoplePicker";
import type { ReadyProfile } from "./useStage";

/** A group that people are being added to. */
export type AddTarget = {
  groupId: Id<"groups">;
  memberIds: readonly string[];
  inviteToken: string;
};

const inviteUrl = (token: string) => `${config.authOrigin}/join/${token}`;
const shown = (url: string) => url.replace(/^https?:\/\//u, "");

/** A name or someone to add is enough to create; adding needs someone. */
const canSubmit = (mode: "create" | "add", count: number, name: string) =>
  count > 0 || (mode === "create" && name.trim() !== "");

/** "Add", "Create", or for a pair "Open" when it exists and "Start" when it does not. */
function primaryLabel(
  mode: "create" | "add",
  pairWith: string | null,
  pairGroupId: string | null | undefined,
) {
  if (mode === "add") return "Add";
  if (!pairWith) return "Create";
  return pairGroupId ? "Open" : "Start";
}

/**
 * The call behind the primary button. While it is out, the only way off the screen is its own move
 * after it succeeds: Cancel, the Android Back button and the swipe are off.
 */
function useSubmit({
  add,
  name,
  token,
  people,
  pairWith,
}: {
  add: AddTarget | undefined;
  name: string;
  token: string;
  people: readonly Found[];
  /** The one person a name-less form starts a pair with, if that is what it does. */
  pairWith: Found["id"] | null;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const busy = useRef(false);
  const leaving = useRef(false);
  const createGroup = useMutation(api.groups.create);
  const openPair = useMutation(api.groups.openPair);
  const addMembers = useMutation(api.groups.addMembers);
  usePreventRemove(phase.kind === "pending", ({ repeat }) => {
    if (leaving.current) repeat();
  });

  async function call() {
    const ids = people.map((person) => person.id);
    if (add) {
      await addMembers({ groupId: add.groupId, profileIds: ids });
      postNotice(`Added ${people.map((person) => person.name).join(", ")}`);
      leaving.current = true;
      router.back();
      return;
    }
    const trimmed = name.trim();
    const groupId = pairWith
      ? await openPair({ profileId: pairWith })
      : await createGroup({
          ...(trimmed ? { name: trimmed } : {}),
          memberIds: ids,
          inviteToken: token,
        });
    leaving.current = true;
    router.replace({ pathname: "/g/[groupId]", params: { groupId } });
  }

  const fail = (message: string) => setPhase({ kind: "failed", message });

  async function submit() {
    if (busy.current) return;
    busy.current = true;
    setPhase({ kind: "pending" });
    try {
      await call();
    } catch (cause) {
      busy.current = false;
      setPhase({ kind: "failed", message: groupError(cause, people.length) });
    }
  }
  return { phase, fail, submit: () => void submit() };
}

/**
 * New group, or Add people to a group. Picking one person and no name opens (or starts) the pair with
 * them; anything else creates a group with its own invite link.
 */
export function NewGroupJourney({ profile, add }: { profile: ReadyProfile; add?: AddTarget }) {
  const router = useRouter();
  const mode = add ? "add" : "create";
  const [name, setName] = useState("");
  const picker = usePeoplePicker({
    mode,
    name,
    ownEmail: profile.email,
    members: add ? add.memberIds : [],
  });
  // The link is shown before the group exists, so the phone makes its token.
  const [token] = useState(() => add?.inviteToken ?? newInviteToken(Crypto.getRandomBytes));
  const pairWith = add ? null : pairCandidate(name, picker.people);
  const { phase, fail, submit } = useSubmit({
    add,
    name,
    token,
    people: picker.people,
    pairWith,
  });
  const { copied, copy } = useCopied();

  async function copyLink() {
    if (!(await copy(inviteUrl(token)))) fail("Couldn't copy the link. Try again.");
  }
  return (
    <>
      <Stack.Screen
        options={{
          gestureEnabled: phase.kind !== "pending",
          fullScreenGestureEnabled: phase.kind !== "pending",
        }}
      />
      <NewGroupScreen
        mode={mode}
        groupName={name}
        onGroupNameChange={setName}
        people={picker.people.map((person) => livePerson(person, config.siteUrl))}
        query={picker.query}
        onQueryChange={picker.setQuery}
        suggestions={picker.suggestions.map((person) => livePerson(person, config.siteUrl))}
        hint={picker.hint}
        onPick={picker.pick}
        onUnpick={picker.unpick}
        inviteLink={pairWith ? null : shown(inviteUrl(token))}
        copied={copied}
        onCopyLink={() => void copyLink()}
        primaryLabel={primaryLabel(mode, pairWith, picker.pairGroupId)}
        primaryEnabled={canSubmit(mode, picker.people.length, name)}
        pending={phase.kind === "pending"}
        error={phase.kind === "failed" ? phase.message : picker.problem}
        onPrimary={submit}
        onCancel={() => router.back()}
      />
    </>
  );
}
