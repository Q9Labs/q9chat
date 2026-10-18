import type { StyleProp, ViewStyle } from "react-native";
import { useTheme } from "../theme";
import { T } from "../theme/Text";
import { radius, resolveColor, type ColorRef } from "../theme/tokens";
import { Icon, type IconName } from "./Icon";
import { Press } from "./Press";

type Variant = "default" | "solid" | "danger" | "solidDanger";

/** Pill button: 36px by default, 44 `big`, 32 `small`; full width when `wide`. */
export function PillButton({
  label,
  onPress,
  variant = "default",
  icon,
  size = "default",
  wide,
  disabled,
  background,
  style,
}: {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  icon?: IconName;
  size?: "default" | "big" | "small" | "sheet";
  wide?: boolean;
  disabled?: boolean | undefined;
  background?: ColorRef;
  style?: StyleProp<ViewStyle>;
}) {
  const { c } = useTheme();
  const bg = {
    default: c.s1,
    solid: c.tx,
    danger: c.s1,
    solidDanger: c.er2,
  }[variant];
  const fg: ColorRef = { default: "tx", solid: "s0", danger: "er", solidDanger: "#ffffff" }[variant];
  const height = { default: 36, big: 44, small: 32, sheet: 48 }[size];
  const fontSize = { default: 13, big: 14, small: 13, sheet: 15 }[size];
  const px = size === "small" ? 12 : 16;
  return (
    <Press
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[
        {
          height,
          paddingHorizontal: px,
          borderRadius: radius.pill,
          backgroundColor: background ? resolveColor(c, background) : bg,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          opacity: disabled ? 0.4 : 1,
        },
        wide || size === "sheet" ? { alignSelf: "stretch" } : null,
        style,
      ]}
    >
      {icon ? <Icon name={icon} size={18} color={fg} /> : null}
      <T size={fontSize} weight={600} color={fg} numberOfLines={1}>
        {label}
      </T>
    </Press>
  );
}

/** Round icon button; 44px on the phone. */
export function IconButton({
  icon,
  label,
  onPress,
  size = 44,
  iconSize = 20,
  color = "mu",
  background,
  disabled,
}: {
  icon: IconName;
  label: string;
  onPress?: () => void;
  size?: number;
  iconSize?: number;
  color?: ColorRef;
  background?: string;
  disabled?: boolean | undefined;
}) {
  return (
    <Press
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      scaleTo={0.92}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: background ?? "transparent",
      }}
    >
      <Icon name={icon} size={iconSize} color={color} />
    </Press>
  );
}
