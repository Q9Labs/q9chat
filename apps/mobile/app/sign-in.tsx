import { useRouter } from "expo-router";
import { useState } from "react";

import { SignInScreen } from "../src/screens/AuthScreens";

export default function SignInRoute() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  return (
    <SignInScreen
      email={email}
      onEmailChange={setEmail}
      onGoogle={() => router.replace("/")}
      onApple={() => router.replace("/")}
      onEmailCode={() => router.push("/code")}
    />
  );
}
