import { useRouter } from "expo-router";
import { useState } from "react";

import { ME_FULL_NAME, defaultWorld, personOf } from "../src/fixtures/build";
import { AccountScreen } from "../src/screens/AccountScreen";

// A fixture person stands in until the wiring lane maps `profiles.me` and the session onto the same props.
const world = defaultWorld();

export default function AccountRoute() {
  const router = useRouter();
  const [name, setName] = useState(ME_FULL_NAME);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [hasPhoto, setHasPhoto] = useState(false);
  return (
    <AccountScreen
      me={{ person: personOf("hasan", world), signedInWith: "Google" }}
      name={name}
      onNameChange={setName}
      hasPhoto={hasPhoto}
      onTogglePhoto={() => setHasPhoto((on) => !on)}
      confirmDelete={confirmDelete}
      toast={null}
      onBack={() => router.back()}
      onSignOut={() => router.replace("/sign-in")}
      onAskDelete={() => setConfirmDelete(true)}
      onConfirmDelete={() => router.replace("/sign-in")}
      onCancelDelete={() => setConfirmDelete(false)}
    />
  );
}
