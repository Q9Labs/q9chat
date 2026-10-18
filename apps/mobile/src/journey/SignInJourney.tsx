import { useEffect, useRef, useState } from "react";

import type { ToastNotice } from "../kit/Overlays";
import { useToast } from "../kit/useToast";
import { CodeScreen, SignInScreen } from "../screens/AuthScreens";
import { isComplete } from "../screens/codeInput";
import { sessionClient, useRevokeStatus, type RevokeStatus } from "../session/client";
import { EmailVerificationError, SignInIncompleteError } from "../session/contracts";
import type { Provider } from "../session/pkce";
import { postNotice, takeNotice } from "./notice";
import { useSignOut } from "./SignOut";

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const INCOMPLETE = new SignInIncompleteError().message;

/** One line under the form: an unconfirmed sign-out wins, then a fresh toast, then "Signed out". */
function noticeOf(
  revoke: RevokeStatus,
  complete: boolean,
  retry: () => void,
  toast: string | null,
): ToastNotice | null {
  if (revoke === "failed")
    return {
      text: "Couldn't sign out of your last session. Try again.",
      action: { label: "Try again", onPress: retry },
    };
  if (toast) return { text: toast };
  return complete ? { text: "Signed out" } : null;
}

/** Sign in by email code, or through Google or Apple in the system auth session; behaves as the web journey does. */
export function SignInJourney() {
  const signOut = useSignOut();
  const revoke = useRevokeStatus();
  const [email, setEmail] = useState("");
  const [codeEmail, setCodeEmail] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState("");
  const [focusKey, setFocusKey] = useState(0);
  const [toast, showToast] = useToast();
  const busy = useRef(false);
  // A sign-out still waiting for the server blocks every way to sign in.
  const locked = () => busy.current || revoke === "revoking";

  useEffect(() => {
    const notice = takeNotice();
    if (notice) showToast(notice);
  }, [showToast]);

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

  const notice = noticeOf(revoke, signOut.complete, signOut.leave, toast);

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
        disabled={revoke === "revoking"}
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
