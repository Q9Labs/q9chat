import { useRouter } from "expo-router";
import { useState } from "react";
import { avatarOf } from "../src/fixtures/build";
import { ProfileScreen } from "../src/screens/AuthScreens";
import { noop } from "../src/kit/noop";

export default function ProfileRoute() {
  const router = useRouter();
  const [name, setName] = useState("Nadia");
  return (
    <ProfileScreen
      email="nadia@q9labs.ai"
      name={name}
      onNameChange={setName}
      avatar={avatarOf("nadia")}
      hasPhoto={false}
      onTogglePhoto={noop}
      onContinue={() => router.replace("/")}
    />
  );
}
