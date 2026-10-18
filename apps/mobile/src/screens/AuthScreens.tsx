import { useRef } from "react";
import { TextInput, View, type TextInputInstance } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PhotoPicker } from "../kit/Avatar";
import { PillButton } from "../kit/Buttons";
import { FieldIcon, Label, Note, TextField } from "../kit/Field";
import { AppleGlyph, GoogleGlyph, Icon } from "../kit/Icon";
import { Wordmark } from "../kit/Logo";
import { Press } from "../kit/Press";
import { useTheme } from "../theme";
import { T } from "../theme/Text";
import { fonts, radius } from "../theme/tokens";
import type { Avatar as AvatarData } from "../types";

/** Centered column on the surface; the card is 100% wide with 24px sides, children 10px apart. */
function AuthFrame({ children }: { children: React.ReactNode }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: c.s0,
        paddingTop: insets.top,
        paddingBottom: insets.bottom,
        justifyContent: "center",
      }}
    >
      <View style={{ paddingHorizontal: 24, gap: 10 }}>{children}</View>
    </View>
  );
}

function Hero({ children }: { children: React.ReactNode }) {
  return <View style={{ alignItems: "center", gap: 8, marginBottom: 18 }}>{children}</View>;
}

function ProviderButton({
  label,
  glyph,
  onPress,
}: {
  label: string;
  glyph: React.ReactNode;
  onPress: () => void;
}) {
  const { c } = useTheme();
  return (
    <Press
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={{
        height: 44,
        borderRadius: 999,
        backgroundColor: c.s1,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
      }}
    >
      {glyph}
      <T weight={600}>{label}</T>
    </Press>
  );
}

export function SignInScreen({
  email,
  onEmailChange,
  onGoogle,
  onApple,
  onEmailCode,
}: {
  email: string;
  onEmailChange: (email: string) => void;
  onGoogle: () => void;
  onApple: () => void;
  onEmailCode: () => void;
}) {
  const { c } = useTheme();
  return (
    <AuthFrame>
      <Hero>
        <View style={{ marginTop: 4, marginBottom: 16 }}>
          <Wordmark size={30} />
        </View>
        <T color="mu" style={{ textAlign: "center" }}>
          Sign in, or create an account if you're new.
        </T>
      </Hero>
      <ProviderButton label="Continue with Google" glyph={<GoogleGlyph />} onPress={onGoogle} />
      <ProviderButton label="Continue with Apple" glyph={<AppleGlyph />} onPress={onApple} />
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginVertical: 8 }}>
        <View style={{ flex: 1, height: 1, backgroundColor: c.ln }} />
        <T size={12} color="mu">
          or
        </T>
        <View style={{ flex: 1, height: 1, backgroundColor: c.ln }} />
      </View>
      <TextField
        icon={<FieldIcon name="mail" />}
        accessibilityLabel="Email"
        placeholder="you@company.com"
        value={email}
        onChangeText={onEmailChange}
        inputMode="email"
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        returnKeyType="go"
        onSubmitEditing={onEmailCode}
      />
      <PillButton label="Email me a code" variant="solid" size="big" wide onPress={onEmailCode} />
      <T size={12} color="mu" lineHeight={19.2} style={{ textAlign: "center", marginTop: 12 }}>
        No passwords. We email you a 6-digit code.
      </T>
    </AuthFrame>
  );
}

const CODE_LENGTH = 6;

function LinkText({ children, onPress }: { children: string; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <T
      size={12}
      weight={600}
      lineHeight={19.2}
      onPress={onPress}
      accessibilityRole="link"
      style={{ textDecorationLine: "underline", textDecorationColor: c.ln2 }}
    >
      {children}
    </T>
  );
}

/** Six labeled digit cells over one string: typing advances, a paste fills forward, backspace steps back. */
export function CodeScreen({
  email,
  code,
  onCodeChange,
  bad,
  onResend,
  onChangeEmail,
}: {
  email: string;
  code: string;
  onCodeChange: (code: string) => void;
  bad: boolean;
  onResend: () => void;
  onChangeEmail: () => void;
}) {
  const { c } = useTheme();
  const refs = useRef<(TextInputInstance | null)[]>([]);
  const digits = Array.from({ length: CODE_LENGTH }, (_, index) => code[index] ?? "");
  const nextIndex = digits.findIndex((digit) => !digit);

  const write = (index: number, text: string) => {
    const typed = text.replace(/\D/g, "");
    if (!typed) return;
    const next = code.slice(0, index) + typed;
    const clipped = next.slice(0, CODE_LENGTH);
    onCodeChange(clipped);
    refs.current[Math.min(index + typed.length, CODE_LENGTH - 1)]?.focus();
  };
  const back = (index: number) => {
    if (digits[index]) {
      onCodeChange(code.slice(0, index) + code.slice(index + 1));
      return;
    }
    if (index === 0) return;
    onCodeChange(code.slice(0, index - 1) + code.slice(index));
    refs.current[index - 1]?.focus();
  };

  return (
    <AuthFrame>
      <Hero>
        <View
          style={{
            width: 56,
            height: 56,
            borderRadius: 28,
            backgroundColor: c.s1,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name="mail" size={24} color="mu" />
        </View>
        <T
          size={22}
          weight={600}
          lineHeight={30.8}
          style={{ marginTop: 10 }}
          accessibilityRole="header"
        >
          Check your email
        </T>
        <T color="mu" style={{ textAlign: "center" }}>
          {"Enter the 6-digit code we sent to "}
          <T weight={700}>{email}</T>
          {"."}
        </T>
      </Hero>
      <View
        accessibilityLabel="6-digit code"
        style={{ flexDirection: "row", justifyContent: "center", gap: 8, marginVertical: 4 }}
      >
        {digits.map((digit, index) => (
          <CodeCell
            key={index}
            index={index}
            digit={digit}
            bad={bad}
            next={index === nextIndex}
            setRef={(node) => {
              refs.current[index] = node;
            }}
            onType={(text) => write(index, text)}
            onBackspace={() => back(index)}
          />
        ))}
      </View>
      <T
        size={13}
        color="er"
        accessibilityRole="alert"
        style={{ textAlign: "center", minHeight: 18, marginTop: 4 }}
      >
        {bad ? "That code didn't work. Check it and try again." : ""}
      </T>
      <View style={{ alignItems: "center", marginTop: 12 }}>
        <T size={12} color="mu" lineHeight={19.2} style={{ textAlign: "center" }}>
          {"Didn't get it? Check spam, or "}
          <LinkText onPress={onResend}>send a new code</LinkText>
          {"."}
        </T>
        <LinkText onPress={onChangeEmail}>Use a different email</LinkText>
      </View>
    </AuthFrame>
  );
}

function CodeCell({
  index,
  digit,
  bad,
  next,
  setRef,
  onType,
  onBackspace,
}: {
  index: number;
  digit: string;
  bad: boolean;
  /** The cell the next digit lands in; the screen keeps focus there, so it carries the focus ring. */
  next: boolean;
  setRef: (node: TextInputInstance | null) => void;
  onType: (text: string) => void;
  onBackspace: () => void;
}) {
  const { c } = useTheme();
  return (
    <TextInput
      ref={setRef}
      accessibilityLabel={`Digit ${index + 1}`}
      value={digit}
      inputMode="numeric"
      keyboardType="number-pad"
      maxLength={CODE_LENGTH}
      textContentType={index === 0 ? "oneTimeCode" : "none"}
      autoComplete={index === 0 ? "one-time-code" : "off"}
      selectionColor={c.ac}
      onChangeText={onType}
      onKeyPress={(event) => {
        if (event.nativeEvent.key === "Backspace") onBackspace();
      }}
      style={{
        width: 48,
        height: 56,
        padding: 0,
        borderRadius: radius.input,
        borderWidth: 1,
        borderColor: bad ? c.er : next ? c.tx : "transparent",
        backgroundColor: c.s1,
        textAlign: "center",
        fontFamily: fonts[600],
        fontSize: 22,
        color: c.tx,
        fontVariant: ["tabular-nums"],
      }}
    />
  );
}

export function ProfileScreen({
  email,
  name,
  onNameChange,
  avatar,
  hasPhoto,
  onTogglePhoto,
  onContinue,
}: {
  email: string;
  name: string;
  onNameChange: (name: string) => void;
  avatar: AvatarData;
  hasPhoto: boolean;
  onTogglePhoto: () => void;
  onContinue: () => void;
}) {
  return (
    <AuthFrame>
      <Hero>
        <T
          size={22}
          weight={600}
          lineHeight={30.8}
          style={{ marginTop: 10 }}
          accessibilityRole="header"
        >
          Set up your profile
        </T>
        <T color="mu" style={{ textAlign: "center" }}>
          This is how people see you in groups.
        </T>
      </Hero>
      <View style={{ alignItems: "center", marginBottom: 6 }}>
        <PhotoPicker avatar={avatar} hasPhoto={hasPhoto} onPress={onTogglePhoto} />
      </View>
      <Label>Your name</Label>
      <TextField
        accessibilityLabel="Your name"
        value={name}
        onChangeText={onNameChange}
        autoCorrect={false}
      />
      <Note
        style={{ marginTop: 0 }}
      >{`Signed in as ${email}. Without a photo, people see your initials on your color.`}</Note>
      <PillButton
        label="Continue"
        variant="solid"
        size="big"
        wide
        disabled={!name.trim()}
        onPress={onContinue}
      />
    </AuthFrame>
  );
}
