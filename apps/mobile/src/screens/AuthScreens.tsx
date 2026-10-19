import { useEffect, useRef } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TextInput,
  View,
  type TextInputInstance,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PhotoPicker } from "../kit/Avatar";
import { PillButton } from "../kit/Buttons";
import { Screen, CenterState } from "../kit/Chrome";
import { FieldIcon, Label, Note, TextField } from "../kit/Field";
import { AppleGlyph, GoogleGlyph, Icon } from "../kit/Icon";
import { Wordmark } from "../kit/Logo";
import { Toast, type ToastNotice } from "../kit/Overlays";
import { Press } from "../kit/Press";
import { useTheme } from "../theme";
import { T } from "../theme/Text";
import { radius } from "../theme/tokens";
import type { Avatar as AvatarData } from "../types";
import { CELL_IDS, CODE_LENGTH, readCode, type Selection } from "./codeInput";

/**
 * Centered column on the surface; the card is 100% wide with 24px sides, children 10px apart.
 * With the keyboard up the column shrinks to what is left and scrolls, so the fields and the button stay reachable.
 */
function AuthFrame({
  children,
  notice,
}: {
  children: React.ReactNode;
  notice?: ToastNotice | null | undefined;
}) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: c.s0 }}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}
      >
        <View style={{ height: insets.top }} />
        <View style={{ paddingHorizontal: 24, gap: 10 }}>{children}</View>
        <View style={{ height: insets.bottom }} />
      </ScrollView>
      {notice ? (
        <Toast text={notice.text} {...(notice.action ? { action: notice.action } : {})} />
      ) : null}
    </KeyboardAvoidingView>
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
        minHeight: 44,
        paddingHorizontal: 16,
        borderRadius: 999,
        backgroundColor: c.s1,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
      }}
    >
      {glyph}
      <T weight={600} style={{ flexShrink: 1, textAlign: "center" }}>
        {label}
      </T>
    </Press>
  );
}

export function SignInScreen({
  email,
  onEmailChange,
  onGoogle,
  onApple,
  onEmailCode,
  notice,
}: {
  email: string;
  onEmailChange: (email: string) => void;
  onGoogle: () => void;
  onApple: () => void;
  onEmailCode: () => void;
  notice?: ToastNotice | null;
}) {
  const { c } = useTheme();
  return (
    <AuthFrame notice={notice}>
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

const TOUCH_TARGET = 44;
const LINK_LINE = 19.2;
/** What a link line lacks to reach a 44-point touch box. */
const LINK_EXTRA = TOUCH_TARGET - LINK_LINE;

/**
 * A link whose touch box is 44 tall. The extra height goes above the text (`up`) or below it (`down`),
 * so each link keeps its own box and the text keeps its place on the page.
 */
function LinkText({
  children,
  onPress,
  extend,
  weight,
}: {
  children: string;
  onPress: () => void;
  extend: "up" | "down";
  weight: 600 | 700;
}) {
  const { c } = useTheme();
  return (
    <Press
      accessibilityRole="button"
      accessibilityLabel={children}
      onPress={onPress}
      scaleTo={1}
      style={extend === "up" ? { paddingTop: LINK_EXTRA } : { paddingBottom: LINK_EXTRA }}
    >
      <T
        size={12}
        weight={weight}
        lineHeight={LINK_LINE}
        style={{ textDecorationLine: "underline", textDecorationColor: c.ln2 }}
      >
        {children}
      </T>
    </Press>
  );
}

/**
 * One six-digit field drawn as six cells. The field itself is invisible and covers the cells, so typing,
 * pasting a code and the system's one-time-code suggestion all land in the same place.
 */
export function CodeScreen({
  email,
  code,
  onCodeChange,
  error,
  focusKey = 0,
  onResend,
  onChangeEmail,
  notice,
}: {
  email: string;
  code: string;
  onCodeChange: (code: string) => void;
  /** The alert under the cells; empty when there is nothing to say. */
  error: string;
  /** Focus goes to the field when the screen opens and whenever this number changes. */
  focusKey?: number;
  onResend: () => void;
  onChangeEmail: () => void;
  notice?: ToastNotice | null;
}) {
  const { c } = useTheme();
  const input = useRef<TextInputInstance>(null);
  // Where the cursor or selection was before the latest edit; a paste replaces exactly that part.
  const selection = useRef<Selection>({ start: code.length, end: code.length });
  useEffect(() => {
    input.current?.focus();
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- focusKey only asks for the focus again
  }, [focusKey]);

  return (
    <AuthFrame notice={notice}>
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
      <View style={{ alignSelf: "center", marginVertical: 4 }}>
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{ flexDirection: "row", gap: 8 }}
        >
          {CELL_IDS.map((id, index) => (
            <CodeCell
              key={id}
              digit={code[index] ?? ""}
              bad={error !== ""}
              next={index === Math.min(code.length, CODE_LENGTH - 1)}
            />
          ))}
        </View>
        <TextInput
          ref={input}
          accessibilityLabel="6-digit code"
          accessibilityHint="Each digit fills the next cell"
          value={code}
          onChangeText={(text) => onCodeChange(readCode(code, text, selection.current))}
          onSelectionChange={(event) => {
            selection.current = event.nativeEvent.selection;
          }}
          inputMode="numeric"
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete={Platform.OS === "android" ? "sms-otp" : "one-time-code"}
          maxFontSizeMultiplier={1.3}
          caretHidden
          selectionColor="transparent"
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            padding: 0,
            // Android reads a fully transparent color as unset and draws the text; one step of alpha is invisible.
            color: "#00000001",
            backgroundColor: "transparent",
          }}
        />
      </View>
      <T
        size={13}
        color="er"
        accessibilityRole="alert"
        style={{ textAlign: "center", minHeight: 18, marginTop: 4 }}
      >
        {error}
      </T>
      {/* Two 44-point touch boxes around two text lines: the margins cancel the padding so the lines sit where the mock puts them. */}
      <View style={{ alignItems: "center", marginTop: 12 - LINK_EXTRA, marginBottom: -LINK_EXTRA }}>
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            justifyContent: "center",
            alignItems: "flex-end",
          }}
        >
          <T size={12} color="mu" lineHeight={LINK_LINE}>
            {"Didn't get it? Check spam, or "}
          </T>
          <LinkText onPress={onResend} extend="up" weight={700}>
            send a new code
          </LinkText>
          <T size={12} color="mu" lineHeight={LINK_LINE}>
            .
          </T>
        </View>
        <LinkText onPress={onChangeEmail} extend="down" weight={600}>
          Use a different email
        </LinkText>
      </View>
    </AuthFrame>
  );
}

function CodeCell({ digit, bad, next }: { digit: string; bad: boolean; next: boolean }) {
  const { c } = useTheme();
  return (
    <View
      style={{
        width: 48,
        height: 56,
        borderRadius: radius.input,
        borderWidth: 1,
        borderColor: bad ? c.er : next ? c.tx : "transparent",
        backgroundColor: c.s1,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <T size={22} weight={600} style={{ fontVariant: ["tabular-nums"] }}>
        {digit}
      </T>
    </View>
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
  onSignOut,
  notice,
}: {
  email: string;
  name: string;
  onNameChange: (name: string) => void;
  avatar: AvatarData;
  hasPhoto: boolean;
  onTogglePhoto: () => void;
  onContinue: () => void;
  onSignOut: () => void;
  notice?: ToastNotice | null;
}) {
  return (
    <AuthFrame notice={notice}>
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
      <Press
        accessibilityRole="button"
        accessibilityLabel="Not you? Sign out"
        onPress={onSignOut}
        scaleTo={1}
        style={{ minHeight: TOUCH_TARGET, justifyContent: "center", alignSelf: "flex-start" }}
      >
        <T size={12} weight={600} style={{ textDecorationLine: "underline" }}>
          Not you? Sign out
        </T>
      </Press>
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

/** A saved session that could not be refreshed: try again, or leave this account without the network. */
export function OfflineRestoreScreen({
  onRetry,
  onSignOut,
}: {
  onRetry: () => void;
  onSignOut: () => void;
}) {
  return (
    <Screen>
      <CenterState
        icon="ban"
        title="Can't connect. Try again."
        text="Your sign-in is saved. Check your connection and try again, or sign out."
        action={
          <View style={{ gap: 8, alignItems: "center" }}>
            <PillButton label="Try again" onPress={onRetry} />
            <PillButton label="Sign out" onPress={onSignOut} />
          </View>
        }
      />
    </Screen>
  );
}
