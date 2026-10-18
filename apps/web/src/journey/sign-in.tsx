import { useRef, useState } from "react";

import { useSession } from "../lib/session.js";
import { EmailCode, SignIn } from "../screens/auth.js";
import { Toast } from "../ui/overlay.js";

const emptyDigits = () => Array.from({ length: 6 }, () => "");

export function SignInJourney({
  authError,
  signedOut,
}: {
  readonly authError: boolean;
  readonly signedOut: boolean;
}) {
  const { startEmail, verifyEmail } = useSession();
  const [email, setEmail] = useState("");
  const [codeEmail, setCodeEmail] = useState<string | null>(null);
  const [digits, setDigits] = useState<readonly string[]>(emptyDigits);
  const [bad, setBad] = useState(false);
  const [notice, setNotice] = useState(
    authError ? "Sign-in wasn't completed. Try again." : signedOut ? "Signed out" : "",
  );
  const busy = useRef(false);

  async function sendCode(resend = false) {
    if (busy.current) return;
    const target = resend ? codeEmail : email.trim();
    if (!target || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(target)) {
      setNotice("Enter your email address");
      return;
    }
    busy.current = true;
    try {
      await startEmail(target);
      setCodeEmail(target);
      setDigits(emptyDigits());
      setBad(false);
      setNotice(resend ? "We sent a new code" : "");
    } catch {
      setNotice("Couldn't send a code. Try again.");
    } finally {
      busy.current = false;
    }
  }

  async function enterDigits(next: readonly string[]) {
    if (busy.current) return;
    setDigits(next);
    setBad(false);
    if (next.join("").length !== 6 || codeEmail === null) return;
    busy.current = true;
    try {
      await verifyEmail(codeEmail, next.join(""));
    } catch (error) {
      if (error instanceof Error && error.message === "invalid_code") {
        setDigits(emptyDigits());
        setBad(true);
      } else setNotice("Sign-in wasn't completed. Try again.");
    } finally {
      busy.current = false;
    }
  }

  return (
    <>
      {codeEmail === null ? (
        <SignIn
          email={email}
          onEmailChange={(value) => {
            setEmail(value);
            setNotice("");
          }}
          onGoogle={() => window.location.assign("/api/auth/oauth/google?client=web")}
          onApple={() => window.location.assign("/api/auth/oauth/apple?client=web")}
          onEmailCode={() => void sendCode()}
        />
      ) : (
        <EmailCode
          email={codeEmail}
          digits={digits}
          onDigitsChange={(next) => void enterDigits(next)}
          bad={bad}
          onResend={() => void sendCode(true)}
          onUseDifferentEmail={() => {
            if (!busy.current) {
              setCodeEmail(null);
              setNotice("");
            }
          }}
        />
      )}
      {notice ? <Toast message={notice} /> : null}
    </>
  );
}
