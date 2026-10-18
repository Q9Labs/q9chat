import { useRouter } from "expo-router";
import { useState } from "react";
import { CodeScreen } from "../src/screens/AuthScreens";

export default function CodeRoute() {
  const router = useRouter();
  const [code, setCode] = useState("");
  return (
    <CodeScreen
      email="hasan@q9labs.ai"
      code={code}
      onCodeChange={(next) => {
        setCode(next);
        if (next.length === 6) router.replace("/");
      }}
      bad={false}
      onResend={() => setCode("")}
      onChangeEmail={() => router.replace("/sign-in")}
    />
  );
}
