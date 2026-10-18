import { useState, type ReactNode } from "react";
import { TextInput, View, type StyleProp, type TextInputProps, type TextStyle } from "react-native";

import { useTheme } from "../theme";
import { T } from "../theme/Text";
import { fonts, radius } from "../theme/tokens";
import { IconButton } from "./Buttons";
import { Icon, type IconName } from "./Icon";

/** Filled 44px input, no focus ring: on focus the border turns the text color. */
export function TextField({
  icon,
  flat,
  right,
  ...input
}: Omit<TextInputProps, "style" | "placeholderTextColor"> & {
  icon?: ReactNode;
  flat?: boolean;
  right?: ReactNode;
}) {
  const { c } = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View
      style={{
        height: 44,
        paddingHorizontal: 14,
        borderRadius: radius.input,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        backgroundColor: flat ? "transparent" : c.s1,
        borderWidth: 1,
        borderColor: focused ? c.tx : flat ? c.ln : "transparent",
      }}
    >
      {icon}
      <TextInput
        {...input}
        onFocus={(event) => {
          setFocused(true);
          input.onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          input.onBlur?.(event);
        }}
        placeholderTextColor={c.mu}
        selectionColor={c.ac}
        style={{
          flex: 1,
          height: "100%",
          padding: 0,
          fontFamily: fonts[400],
          fontSize: 15,
          color: c.tx,
        }}
      />
      {right}
    </View>
  );
}

export function FieldIcon({ name }: { name: IconName }) {
  return <Icon name={name} size={20} color="mu" />;
}

/** A static value shown like an input, such as "Signed in with". */
export function FlatValue({ icon, text }: { icon: ReactNode; text: string }) {
  const { c } = useTheme();
  return (
    <View
      style={{
        height: 44,
        paddingHorizontal: 14,
        borderRadius: radius.input,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        borderWidth: 1,
        borderColor: c.ln,
      }}
    >
      {icon}
      <T color="tx">{text}</T>
    </View>
  );
}

export function Label({ children }: { children: string }) {
  return (
    <T size={13} weight={600} style={{ marginHorizontal: 2, marginBottom: 6 }}>
      {children}
    </T>
  );
}

export function Note({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return (
    <T size={12} color="mu" style={[{ marginTop: 6, marginHorizontal: 2 }, style]}>
      {children}
    </T>
  );
}

/** Label above a control with the mock's 16px gap below. */
export function Field({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <View style={{ marginBottom: 16 }}>
      {label ? <Label>{label}</Label> : null}
      {children}
    </View>
  );
}

/** The invite link with its copy button; the check shows briefly after copying. */
export function LinkBox({
  link,
  copied,
  onCopy,
}: {
  link: string;
  copied: boolean;
  onCopy: () => void;
}) {
  const { c } = useTheme();
  return (
    <View
      style={{
        height: 44,
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        paddingLeft: 14,
        paddingRight: 4,
        borderRadius: 12,
        backgroundColor: c.s1,
      }}
    >
      <T size={13} color="tx2" numberOfLines={1} style={{ flex: 1 }}>
        {link}
      </T>
      <IconButton
        icon={copied ? "check" : "copy"}
        iconSize={18}
        size={36}
        color={copied ? "tx" : "mu"}
        label={copied ? "Copied" : "Copy invite link"}
        onPress={onCopy}
      />
    </View>
  );
}
