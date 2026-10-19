import { View, type StyleProp, type ViewStyle } from "react-native";

import { useTheme } from "../theme";
import { T } from "../theme/Text";
import { radius, resolveColor, type ColorRef } from "../theme/tokens";
import { Icon, type IconName } from "./Icon";
import { Press } from "./Press";

const MIN_TARGET = 44;

type Variant = "default" | "solid" | "danger" | "solidDanger";

type PillSize = "default" | "big" | "small" | "sheet";

const PILL_HEIGHT: Record<PillSize, number> = { default: 36, big: 44, small: 32, sheet: 48 };
const PILL_FONT: Record<PillSize, number> = { default: 13, big: 14, small: 13, sheet: 15 };

/** The look of a pill: its box, and the color of what is written on it. */
function usePillLook(
  variant: Variant,
  size: PillSize,
  options: {
    wide?: boolean | undefined;
    disabled?: boolean | undefined;
    background?: ColorRef | undefined;
  },
) {
  const { c } = useTheme();
  const bg = {
    default: c.s1,
    solid: c.tx,
    danger: c.s1,
    solidDanger: c.er2,
  }[variant];
  const fg: ColorRef = { default: "tx", solid: "s0", danger: "er", solidDanger: "#ffffff" }[
    variant
  ];
  const pill: ViewStyle = {
    minHeight: PILL_HEIGHT[size],
    paddingHorizontal: size === "small" ? 12 : 16,
    borderRadius: radius.pill,
    backgroundColor: options.background ? resolveColor(c, options.background) : bg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    opacity: options.disabled ? 0.4 : 1,
    ...(options.wide || size === "sheet" ? { alignSelf: "stretch" } : {}),
  };
  return { pill, fg };
}

/** Pill button: 36px by default, 44 `big`, 32 `small`; full width when `wide`. */
export function PillButton({
  label,
  testID,
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
  testID?: string | undefined;
  onPress?: () => void;
  variant?: Variant;
  icon?: IconName;
  size?: PillSize;
  wide?: boolean;
  disabled?: boolean | undefined;
  background?: ColorRef;
  style?: StyleProp<ViewStyle>;
}) {
  const { pill, fg } = usePillLook(variant, size, { wide, disabled, background });
  const content = (
    <>
      {icon ? <Icon name={icon} size={18} color={fg} /> : null}
      <T
        size={PILL_FONT[size]}
        weight={600}
        color={fg}
        style={{ flexShrink: 1, textAlign: "center" }}
      >
        {label}
      </T>
    </>
  );
  const press = {
    testID,
    accessibilityRole: "button",
    accessibilityLabel: label,
    accessibilityState: { disabled: !!disabled },
    disabled,
    onPress,
  } as const;
  if (PILL_HEIGHT[size] >= MIN_TARGET)
    return (
      <Press {...press} style={[pill, style]}>
        {content}
      </Press>
    );
  // A shorter pill keeps its look inside a box that is 44 points tall. `hitSlop` would be clipped
  // by a parent that is only as tall as the pill, so the touch box has to be real layout.
  return (
    <Press
      {...press}
      style={[
        { minHeight: MIN_TARGET, justifyContent: "center", alignSelf: pill.alignSelf },
        style,
      ]}
    >
      <View style={pill}>{content}</View>
    </Press>
  );
}

/** Round icon button; 44px on the phone. A smaller one keeps its look and still gets a 44px touch area. */
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
  const slop = Math.max(0, (MIN_TARGET - size) / 2);
  return (
    <Press
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      hitSlop={slop}
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
