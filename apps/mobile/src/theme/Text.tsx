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
  style?: StyleProp<TextStyle>;
};

/** Figtree text at the mock's sizes: body 15px on the phone, line height 1.4. */
export function T({
  size = 15,
  weight = 400,
  color = "tx",
  lineHeight,
  tabular,
  italic,
  style,
  ...rest
}: Props) {
  const { c } = useTheme();
  const resolved = resolveColor(c, color);
  return (
    <RNText
      maxFontSizeMultiplier={1.3}
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
