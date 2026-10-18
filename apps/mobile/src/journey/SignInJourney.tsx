import { useEffect, useRef, useState } from "react";

import type { ToastNotice } from "../kit/Overlays";
import { useToast } from "../kit/useToast";
import { CodeScreen, SignInScreen } from "../screens/AuthScreens";
import { isComplete } from "../screens/codeInput";
import { sessionClient } from "../session/client";
import { EmailVerificationError, SignInIncompleteError } from "../session/contracts";
import type { Provider } from "../session/pkce";
import { postNotice } from "./notice";
import { useSignOut } from "./SignOut";

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const INCOMPLETE = new SignInIncompleteError().message;

type SignOutState = ReturnType<typeof useSignOut>;

/** One line under the form: a failed sign-out wins, then a fresh toast, then "Signed out". */
function noticeOf(signOut: SignOutState, toast: string | null): ToastNotice | null {
  if (signOut.status === "failed")
    return {
      text: "Couldn't sign out. Try again.",
      action: { label: "Try again", onPress: signOut.leave },
    };
  if (toast) return { text: toast };
  return signOut.status === "complete" ? { text: "Signed out" } : null;
}

/** Sign in by email code, or through Google or Apple in the system auth session; behaves as the web journey does. */
export function SignInJourney({ authError }: { authError: boolean }) {
  const signOut = useSignOut();
  const [email, setEmail] = useState("");
  const [codeEmail, setCodeEmail] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState("");
  const [focusKey, setFocusKey] = useState(0);
  const [toast, showToast] = useToast();
  const busy = useRef(false);
  // A sign-out still waiting for the server blocks every way to sign in.
  const locked = () => busy.current || signOut.status === "pending";

  useEffect(() => {
    if (authError) showToast(INCOMPLETE);
  }, [authError, showToast]);

  async function sendCode(resend = false) {
    if (locked()) return;
    signOut.clear();
    const target = resend ? codeEmail : email.trim();
    if (!target || !EMAIL_SHAPE.test(target)) {
      showToast("Enter your email address");
      return;
    }
    busy.current = true;
    try {
      await sessionClient.startEmail(target);
      setCodeEmail(target);
      setCode("");
      setCodeError("");
      setFocusKey((key) => key + 1);
      if (resend) showToast("We sent a new code");
    } catch {
      showToast("Couldn't send a code. Try again.");
    } finally {
      busy.current = false;
    }
  }

  async function enterCode(next: string) {
    if (busy.current) return;
    setCode(next);
    setCodeError("");
    if (!isComplete(next) || codeEmail === null) return;
    busy.current = true;
    try {
      await sessionClient.verifyEmail(codeEmail, next);
    } catch (error) {
      if (error instanceof EmailVerificationError) {
        setCode("");
        setCodeError(error.message);
        setFocusKey((key) => key + 1);
      } else showToast(INCOMPLETE);
    } finally {
      busy.current = false;
    }
  }

  async function signInWith(provider: Provider) {
    if (locked()) return;
    signOut.clear();
    busy.current = true;
    try {
      await sessionClient.startOAuth(provider);
      postNotice(`Signed in with ${provider === "google" ? "Google" : "Apple"}`);
    } catch (error) {
      // A closed window, a refusal and a failed exchange all read the same to the person.
      showToast(error instanceof SignInIncompleteError ? error.message : INCOMPLETE);
    } finally {
      busy.current = false;
    }
  }

  const notice = noticeOf(signOut, toast);

  if (codeEmail === null)
    return (
      <SignInScreen
        email={email}
        onEmailChange={(value) => {
          signOut.clear();
          setEmail(value);
        }}
        onGoogle={() => void signInWith("google")}
        onApple={() => void signInWith("apple")}
        onEmailCode={() => void sendCode()}
        disabled={signOut.status === "pending"}
        notice={notice}
      />
    );
  return (
    <CodeScreen
      email={codeEmail}
      code={code}
      onCodeChange={(next) => void enterCode(next)}
      error={codeError}
      focusKey={focusKey}
      onResend={() => void sendCode(true)}
      onChangeEmail={() => {
        if (!busy.current) setCodeEmail(null);
      }}
      notice={notice}
    />
  );
}
