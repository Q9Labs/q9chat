import { useRouter } from "expo-router";
import { useState } from "react";
import { defaultWorld, personOf } from "../src/fixtures/build";
import { PEOPLE } from "../src/fixtures/seed";
import { useToast } from "../src/kit/useToast";
import { NewGroupScreen } from "../src/screens/NewGroupScreen";

// Fixture people stand in until the wiring lane maps `people.find` onto the same props.
const world = defaultWorld();
const INVITE_LINK = "chat.q9labs.ai/join/b7Tx4k";

export default function NewGroupRoute() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [, showToast] = useToast();
  const q = query.trim().toLowerCase();
  const suggestions = q
    ? Object.values(PEOPLE)
        .filter((p) => p.id !== "hasan" && !picked.includes(p.id) && (p.name.toLowerCase().startsWith(q) || p.email.startsWith(q)))
        .slice(0, 4)
        .map((p) => personOf(p.id, world))
    : [];
  const single = picked.length === 1 && !name.trim();
  return (
    <NewGroupScreen
      mode="create"
      groupName={name}
      onGroupNameChange={setName}
      people={picked.map((id) => personOf(id, world))}
      query={query}
      onQueryChange={setQuery}
      suggestions={suggestions}
      hint={q || picked.length ? null : { kind: "explain" }}
      onPick={(id) => {
        setPicked((current) => [...current, id]);
        setQuery("");
      }}
      onUnpick={(id) => setPicked((current) => current.filter((x) => x !== id))}
      inviteLink={INVITE_LINK}
      copied={false}
      onCopyLink={() => showToast("Copied")}
      primaryLabel={single ? "Start" : "Create"}
      primaryEnabled={!!name.trim() || picked.length > 0}
      onPrimary={() => router.replace("/")}
      onCancel={() => router.back()}
    />
  );
}
