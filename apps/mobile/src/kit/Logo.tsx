import { View } from "react-native";
import Svg, { Path, Rect } from "react-native-svg";

import { T } from "../theme/Text";
import { NINE_PATH, Q_PATH } from "./q9-mark-paths";

const TILE = "#111118";
const OCEAN = "#62a8e6";

/** The Q9 Labs tile: full bleed, no padding, no outline; the platform or `radius` clips the corners. */
function Mark({ size, rounded = true }: { size: number; rounded?: boolean }) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="-1 0 355 355"
      accessibilityRole="image"
      accessibilityLabel="Q9"
    >
      <Rect x="-1" width="355" height="355" rx={rounded ? 79.5 : 0} fill={TILE} />
      <Path fillRule="evenodd" fill="#ffffff" d={Q_PATH} />
      <Path fillRule="evenodd" fill={OCEAN} d={NINE_PATH} />
    </Svg>
  );
}

/** The mark followed by "Chat"; `size` is the font size, the mark is 1.58em like the mock. */
export function Wordmark({ size }: { size: number }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: size * 0.33 }}>
      <Mark size={size * 1.58} />
      <T size={size} weight={600} lineHeight={size}>
        Chat
      </T>
    </View>
  );
}
