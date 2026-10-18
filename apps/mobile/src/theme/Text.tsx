import { Text as RNText, type StyleProp, type TextProps, type TextStyle } from "react-native";

import { useTheme } from ".";
import { fonts, italicFont, resolveColor, type ColorRef, type Weight } from "./tokens";

type Props = Omit<TextProps, "style"> & {
  size?: number;
  weight?: Weight;
  color?: ColorRef;
  lineHeight?: number;
  tabular?: boolean;
  italic?: boolean;
  /** For tight fixed-size labels (badges, reaction counts, avatar initials): grow with the text size up to 1.3 times. */
  capped?: boolean;
  style?: StyleProp<TextStyle>;
};

/** Figtree text at the mock's sizes: body 15px on the phone, line height 1.4. It follows the person's text size. */
export function T({
  size = 15,
  weight = 400,
  color = "tx",
  lineHeight,
  tabular,
  italic,
  capped,
  style,
  ...rest
}: Props) {
  const { c } = useTheme();
  const resolved = resolveColor(c, color);
  return (
    <RNText
      maxFontSizeMultiplier={capped ? 1.3 : undefined}
      {...rest}
      style={[
        {
          fontFamily: italic ? italicFont : fonts[weight],
          fontSize: size,
          lineHeight: lineHeight ?? Math.round(size * 1.4 * 100) / 100,
          color: resolved,
        },
        tabular ? { fontVariant: ["tabular-nums"] } : null,
        style,
      ]}
    />
  );
}
