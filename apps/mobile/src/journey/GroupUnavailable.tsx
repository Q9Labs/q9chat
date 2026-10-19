import { useRouter } from "expo-router";

import { CenterState, PageNav, Screen } from "../kit/Chrome";

/** The group is not there to open: no access, or no connection to ask. */
export function GroupUnavailable({ denied }: { denied: boolean }) {
  const router = useRouter();
  // A link can open this screen with nothing behind it, so Back falls back to Groups.
  const leave = () => (router.canGoBack() ? router.back() : router.replace("/"));
  return (
    <Screen>
      <PageNav title="" start={{ back: true, onPress: leave }} />
      <CenterState
        icon={denied ? "ban" : "wifiOff"}
        title={denied ? "You no longer have access to this group" : "Can't connect"}
        text={
          denied
            ? "Only members can open a group."
            : "This group will load when you're back online."
        }
      />
    </Screen>
  );
}

/** A link whose group id is not an id at all makes the query throw, not answer "no access"; it reads the same. */
export function BadGroupLink() {
  return <GroupUnavailable denied />;
}
