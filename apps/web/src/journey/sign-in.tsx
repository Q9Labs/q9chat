import { useLayoutEffect, useRef, useState } from "react";

import { EmailVerificationError, useSession } from "../lib/session.js";
import { EmailCode, SignIn } from "../screens/auth.js";
import { Toast } from "../ui/overlay.js";
import { rememberJoinPath, savedJoinPath, startOAuth } from "./oauth.js";

const emptyDigits = () => Array.from({ length: 6 }, () => "");

function useInviteReturn(authError: boolean) {
  useLayoutEffect(() => {
    const saved = savedJoinPath();
    if (authError && saved && window.location.pathname !== saved) {
      window.location.replace(`${saved}?authError=1`);
    } else rememberJoinPath();
  }, [authError]);
}

export function SignInJourney({
  authError,
  signOutStatus,
  onSignInAttempt,
}: {
  readonly authError: boolean;
  readonly signOutStatus: "idle" | "pending" | "complete" | "failed";
  readonly onSignInAttempt: () => void;
}) {
  const { startEmail, verifyEmail } = useSession();
  const [email, setEmail] = useState("");
  const [codeEmail, setCodeEmail] = useState<string | null>(null);
  const [digits, setDigits] = useState<readonly string[]>(emptyDigits);
  const [codeError, setCodeError] = useState("");
  const [notice, setNotice] = useState(authError ? "Sign-in wasn't completed. Try again." : "");
  const busy = useRef(false);
  useInviteReturn(authError);

  async function sendCode(resend = false) {
    if (busy.current) return;
    onSignInAttempt();
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
      setCodeError("");
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
    setCodeError("");
    if (next.join("").length !== 6 || codeEmail === null) return;
    busy.current = true;
    try {
      await verifyEmail(codeEmail, next.join(""));
    } catch (error) {
      if (error instanceof EmailVerificationError) {
        setDigits(emptyDigits());
        setCodeError(error.message);
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
            onSignInAttempt();
            setEmail(value);
            setNotice("");
          }}
          onGoogle={() => startOAuth("google")}
          onApple={() => startOAuth("apple")}
          onEmailCode={() => void sendCode()}
        />
      ) : (
        <EmailCode
          email={codeEmail}
          digits={digits}
          onDigitsChange={(next) => void enterDigits(next)}
          bad={codeError !== ""}
          errorMessage={codeError}
          onResend={() => void sendCode(true)}
          onUseDifferentEmail={() => {
            if (!busy.current) {
              setCodeEmail(null);
              setNotice("");
            }
          }}
        />
      )}
      <SignInNotice status={signOutStatus} notice={notice} />
    </>
  );
}

function SignInNotice({
  status,
  notice,
}: {
  readonly status: "idle" | "pending" | "complete" | "failed";
  readonly notice: string;
}) {
  if (status === "failed") return null;
  const message = status === "complete" ? "Signed out" : notice;
  return message ? <Toast message={message} /> : null;
}
