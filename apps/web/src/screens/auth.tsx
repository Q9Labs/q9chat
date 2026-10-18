import { useEffect, useRef, type ClipboardEvent, type KeyboardEvent } from "react";

import type { Avatar as AvatarData } from "../chat/types.js";
import { Avatar } from "../ui/avatar.js";
import { Wordmark } from "../ui/brand.js";
import { Button, TextInput } from "../ui/controls.js";
import { AppleMark, GoogleMark, Icon } from "../ui/icons.js";

interface SignInProps {
  readonly email: string;
  readonly onEmailChange: (email: string) => void;
  readonly onGoogle: () => void;
  readonly onApple: () => void;
  readonly onEmailCode: () => void;
}

/** Sign in or create an account: Google, Apple, or an emailed code. No passwords. */
export function SignIn({ email, onEmailChange, onGoogle, onApple, onEmailCode }: SignInProps) {
  return (
    <div className="auth">
      <div className="auth-card">
        <div className="auth-hero">
          <span className="awm">
            <Wordmark />
          </span>
          <p>Sign in, or create an account if you're new.</p>
        </div>
        <button type="button" className="auth-button" onClick={onGoogle}>
          <GoogleMark />
          Continue with Google
        </button>
        <button type="button" className="auth-button" onClick={onApple}>
          <AppleMark />
          Continue with Apple
        </button>
        <div className="or">or</div>
        <TextInput
          icon="mail"
          label="Email"
          placeholder="you@company.com"
          inputMode="email"
          value={email}
          onChange={onEmailChange}
          onEnter={onEmailCode}
        />
        <Button variant="solid" size="big" wide onClick={onEmailCode}>
          Email me a code
        </Button>
        <p className="fine">No passwords. We email you a 6-digit code.</p>
      </div>
    </div>
  );
}

const CODE_LENGTH = 6;

interface EmailCodeProps {
  readonly email: string;
  /** Six cells, each empty or one digit. */
  readonly digits: readonly string[];
  readonly onDigitsChange: (digits: readonly string[]) => void;
  /** Shows the rejected-code message and a red border. */
  readonly bad: boolean;
  readonly onResend: () => void;
  readonly onUseDifferentEmail: () => void;
}

/** Six digit cells: typing advances, a paste fills forward, Backspace on an empty cell steps back. */
export function EmailCode({
  email,
  digits,
  onDigitsChange,
  bad,
  onResend,
  onUseDifferentEmail,
}: EmailCodeProps) {
  const cells = useRef<(HTMLInputElement | null)[]>([]);
  useEffect(() => {
    if (bad) cells.current[0]?.focus();
  }, [bad]);

  const focusCell = (index: number) =>
    cells.current[Math.max(0, Math.min(index, CODE_LENGTH - 1))]?.focus();

  const fill = (from: number, typed: string) => {
    const incoming = typed.replace(/\D/g, "");
    if (incoming === "") return;
    const next = [...digits];
    let written = 0;
    for (const digit of incoming.slice(0, CODE_LENGTH - from)) {
      next[from + written] = digit;
      written += 1;
    }
    onDigitsChange(next);
    focusCell(from + written);
  };

  const onKeyDown = (index: number, event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Backspace" || digits[index] !== "" || index === 0) return;
    event.preventDefault();
    onDigitsChange(digits.map((digit, at) => (at === index - 1 ? "" : digit)));
    focusCell(index - 1);
  };

  const onPaste = (index: number, event: ClipboardEvent<HTMLInputElement>) => {
    event.preventDefault();
    fill(index, event.clipboardData.getData("text"));
  };

  return (
    <div className="auth">
      <div className="auth-card">
        <div className="auth-hero">
          <span className="empty-badge">
            <Icon name="mail" />
          </span>
          <h1>Check your email</h1>
          <p>
            Enter the 6-digit code we sent to <b style={{ color: "var(--tx)" }}>{email}</b>.
          </p>
        </div>
        <fieldset className={`cds${bad ? " bad" : ""}`} aria-label="6-digit code">
          {Array.from({ length: CODE_LENGTH }, (_, index) => (
            <input
              // The cell position is its identity.
              // oxlint-disable-next-line react/no-array-index-key
              key={index}
              ref={(el) => {
                cells.current[index] = el;
              }}
              className="cd"
              inputMode="numeric"
              autoComplete={index === 0 ? "one-time-code" : "off"}
              aria-label={`Digit ${index + 1}`}
              value={digits[index] ?? ""}
              onChange={(event) => {
                if (event.target.value === "")
                  onDigitsChange(digits.map((digit, at) => (at === index ? "" : digit)));
                else fill(index, event.target.value);
              }}
              onKeyDown={(event) => onKeyDown(index, event)}
              onPaste={(event) => onPaste(index, event)}
              onFocus={(event) => event.target.select()}
            />
          ))}
        </fieldset>
        <p className="code-error" role="alert">
          {bad ? "That code didn't work. Check it and try again." : ""}
        </p>
        <p className="fine">
          Didn't get it? Check spam, or{" "}
          <button type="button" className="lnk" onClick={onResend}>
            send a new code
          </button>
          .<br />
          <button type="button" className="lnk" onClick={onUseDifferentEmail}>
            Use a different email
          </button>
        </p>
      </div>
    </div>
  );
}

interface SetUpProfileProps {
  readonly name: string;
  readonly onNameChange: (name: string) => void;
  readonly email: string;
  readonly avatar: AvatarData;
  readonly onTogglePhoto: () => void;
  readonly onContinue: () => void;
}

/** First sign-in only: a name and an optional photo. */
export function SetUpProfile({
  name,
  onNameChange,
  email,
  avatar,
  onTogglePhoto,
  onContinue,
}: SetUpProfileProps) {
  return (
    <div className="auth">
      <div className="auth-card">
        <div className="auth-hero">
          <h1>Set up your profile</h1>
          <p>This is how people see you in groups.</p>
        </div>
        <div className="profile-wrap">
          <button
            type="button"
            className="profile-avatar"
            aria-label={avatar.photoUrl === null ? "Add a photo" : "Remove photo"}
            onClick={onTogglePhoto}
          >
            <Avatar avatar={avatar} size="xl" />
            <span className="cam">
              <Icon name="camera" />
            </span>
          </button>
        </div>
        <label className="lbl" htmlFor="profile-name">
          Your name
        </label>
        <TextInput id="profile-name" value={name} onChange={onNameChange} onEnter={onContinue} />
        <p className="note" style={{ margin: "0 2px" }}>
          Signed in as {email}. Without a photo, people see your initials on your color.
        </p>
        <Button variant="solid" size="big" wide disabled={name.trim() === ""} onClick={onContinue}>
          Continue
        </Button>
      </div>
    </div>
  );
}
