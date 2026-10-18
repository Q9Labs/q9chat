import { useRouter } from "expo-router";
import { useState } from "react";

import { CodeScreen } from "../src/screens/AuthScreens";
import { type CodeDigits, emptyDigits, isComplete } from "../src/screens/codeInput";

export default function CodeRoute() {
  const router = useRouter();
  const [digits, setDigits] = useState<CodeDigits>(emptyDigits);
  return (
    <CodeScreen
      email="hasan@q9labs.ai"
      digits={digits}
      onDigitsChange={(next) => {
        setDigits(next);
        if (isComplete(next)) router.replace("/");
      }}
      error=""
      onResend={() => setDigits(emptyDigits())}
      onChangeEmail={() => router.replace("/sign-in")}
    />
  );
}
