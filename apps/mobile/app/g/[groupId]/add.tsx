import { api, type Id } from "@q9chat/convex";
import { useQuery } from "convex/react";
import { Redirect, useLocalSearchParams } from "expo-router";

import { Loading } from "../../../src/journey/Loading";
import { NewGroupJourney } from "../../../src/journey/NewGroupJourney";
import { useStage } from "../../../src/journey/useStage";

/** Add people to a group: the same picker as New group, over the group's current members. */
export default function AddPeopleRoute() {
  const stage = useStage();
  const { groupId } = useLocalSearchParams<{ groupId: Id<"groups"> }>();
  const group = useQuery(api.groups.get, { groupId });
  if (stage.kind !== "ready") return <Redirect href="/" />;
  if (group === undefined) return <Loading />;
  // A pair takes no more people, and a group you are no longer in has nothing to add to.
  if (group?.status !== "member" || group.inviteToken === null)
    return <Redirect href={{ pathname: "/g/[groupId]", params: { groupId } }} />;
  return (
    <NewGroupJourney
      profile={stage.profile}
      add={{
        groupId,
        memberIds: group.members.map((member) => member.id),
        inviteToken: group.inviteToken,
      }}
    />
  );
}

export { BadGroupLink as ErrorBoundary } from "../../../src/journey/GroupUnavailable";
