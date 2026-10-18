import { useRouter } from "expo-router";
import { useState } from "react";

import { defaultWorld, searchOf } from "../src/fixtures/build";
import { noop } from "../src/kit/noop";
import { SearchScreen } from "../src/screens/SearchScreen";

// Fixture messages stand in until the wiring lane maps `messages.search` onto the same props.
const world = defaultWorld();

export default function SearchRoute() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  return (
    <SearchScreen
      query={query}
      onQueryChange={setQuery}
      scopeTitle={null}
      onClearScope={noop}
      hits={searchOf(query, world, null)}
      onOpenHit={(hit) =>
        router.replace({ pathname: "/g/[groupId]", params: { groupId: hit.groupId } })
      }
      onCancel={() => router.back()}
    />
  );
}
