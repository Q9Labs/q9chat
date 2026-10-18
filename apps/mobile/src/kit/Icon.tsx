import type { ReactNode } from "react";
import Svg, { Circle, G, Path, Rect } from "react-native-svg";
import { useTheme } from "../theme";
import { resolveColor, type ColorRef } from "../theme/tokens";

// One rounded outline family, 1.75px stroke on a 24 grid, ported from the mock.
const outline = {
  search: (
    <>
      <Circle cx="11" cy="11" r="7" />
      <Path d="m20 20-3.5-3.5" />
    </>
  ),
  pencil: (
    <>
      <Path d="M12 20h9" />
      <Path d="M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4Z" />
    </>
  ),
  bell: (
    <>
      <Path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <Path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </>
  ),
  bellAll: (
    <>
      <Path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <Path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      <Path d="M21.5 8A9 9 0 0 0 19 2.5M2.5 8A9 9 0 0 1 5 2.5" />
    </>
  ),
  bellOff: (
    <>
      <Path d="M8.7 3A6 6 0 0 1 18 8c0 3 .7 5 1.5 6.4" />
      <Path d="M17 17H3s3-2 3-9a4.7 4.7 0 0 1 .3-1.7" />
      <Path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      <Path d="m2 2 20 20" />
    </>
  ),
  more: (
    <>
      <Circle cx="5" cy="12" r="1.3" />
      <Circle cx="12" cy="12" r="1.3" />
      <Circle cx="19" cy="12" r="1.3" />
    </>
  ),
  clip: <Path d="m21.4 11.1-9.2 9.2a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5" />,
  mic: (
    <>
      <Rect x="9" y="2" width="6" height="12" rx="3" />
      <Path d="M19 10a7 7 0 0 1-14 0" />
      <Path d="M12 17v5" />
    </>
  ),
  up: (
    <>
      <Path d="M12 19V5" />
      <Path d="m5 12 7-7 7 7" />
    </>
  ),
  check: <Path d="M20 6 9 17l-5-5" />,
  x: (
    <>
      <Path d="M18 6 6 18" />
      <Path d="m6 6 12 12" />
    </>
  ),
  file: (
    <>
      <Path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
      <Path d="M14 2v6h6" />
    </>
  ),
  image: (
    <>
      <Rect x="3" y="3" width="18" height="18" rx="2" />
      <Circle cx="9" cy="9" r="2" />
      <Path d="m21 15-5-5L5 21" />
    </>
  ),
  back: <Path d="m15 18-6-6 6-6" />,
  chev: <Path d="m9 18 6-6-6-6" />,
  down: (
    <>
      <Path d="M12 5v14" />
      <Path d="m19 12-7 7-7-7" />
    </>
  ),
  reply: (
    <>
      <Path d="M9 14 4 9l5-5" />
      <Path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
    </>
  ),
  copy: (
    <>
      <Rect x="9" y="9" width="13" height="13" rx="2" />
      <Path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </>
  ),
  flag: (
    <>
      <Path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
      <Path d="M4 22v-7" />
    </>
  ),
  trash: (
    <>
      <Path d="M3 6h18" />
      <Path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <Path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </>
  ),
  info: (
    <>
      <Circle cx="12" cy="12" r="10" />
      <Path d="M12 16v-4" />
      <Path d="M12 8h.01" />
    </>
  ),
  link: (
    <>
      <Path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" />
      <Path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
    </>
  ),
  userPlus: (
    <>
      <Path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <Circle cx="9" cy="7" r="4" />
      <Path d="M19 8v6" />
      <Path d="M22 11h-6" />
    </>
  ),
  users: (
    <>
      <Path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <Circle cx="9" cy="7" r="4" />
      <Path d="M22 21v-2a4 4 0 0 0-3-3.9" />
      <Path d="M16 3.1a4 4 0 0 1 0 7.8" />
    </>
  ),
  logout: (
    <>
      <Path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <Path d="m16 17 5-5-5-5" />
      <Path d="M21 12H9" />
    </>
  ),
  alert: (
    <>
      <Circle cx="12" cy="12" r="10" />
      <Path d="M12 8v4" />
      <Path d="M12 16h.01" />
    </>
  ),
  clock: (
    <>
      <Circle cx="12" cy="12" r="9" />
      <Path d="M12 7v5l3 2" />
    </>
  ),
  wifiOff: (
    <>
      <Path d="m2 2 20 20" />
      <Path d="M8.5 16.5a5 5 0 0 1 7 0" />
      <Path d="M2 8.8a15 15 0 0 1 4.2-2.7" />
      <Path d="M10.7 5.1A15 15 0 0 1 22 8.8" />
      <Path d="M5 12.6a10 10 0 0 1 5.2-2.8" />
      <Path d="M16.8 11.2A10 10 0 0 1 19 12.6" />
      <Path d="M12 20h.01" />
    </>
  ),
  ban: (
    <>
      <Circle cx="12" cy="12" r="9" />
      <Path d="m5.6 5.6 12.8 12.8" />
    </>
  ),
  camera: (
    <>
      <Path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z" />
      <Circle cx="12" cy="13" r="3" />
    </>
  ),
  lock: (
    <>
      <Rect x="5" y="11" width="14" height="10" rx="2" />
      <Path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </>
  ),
  mail: (
    <>
      <Rect x="2" y="4" width="20" height="16" rx="2" />
      <Path d="m22 7-10 6L2 7" />
    </>
  ),
  plus: (
    <>
      <Path d="M12 5v14" />
      <Path d="M5 12h14" />
    </>
  ),
  chat: <Path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />,
} satisfies Record<string, ReactNode>;

// Solid glyphs: filled, no stroke.
const solid = {
  play: <Path d="M7 4v16l13-8Z" />,
  pause: <Path d="M7 4h3v16H7zM14 4h3v16h-3z" />,
} satisfies Record<string, ReactNode>;

type SolidName = keyof typeof solid;
export type IconName = keyof typeof outline | SolidName;

const isSolid = (name: IconName): name is SolidName => name in solid;

export function Icon({
  name,
  size = 20,
  color = "mu",
  strokeWidth = 1.75,
}: {
  name: IconName;
  size?: number;
  color?: ColorRef;
  strokeWidth?: number;
}) {
  const { c } = useTheme();
  const tint = resolveColor(c, color);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {isSolid(name) ? (
        <G fill={tint} stroke="none">
          {solid[name]}
        </G>
      ) : (
        <G
          fill="none"
          stroke={tint}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {outline[name]}
        </G>
      )}
    </Svg>
  );
}

export function GoogleGlyph({ size = 18 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        fill="#4285F4"
        d="M22.6 12.2c0-.8-.1-1.5-.2-2.2H12v4.2h5.9a5 5 0 0 1-2.2 3.3v2.7h3.6c2.1-1.9 3.3-4.8 3.3-8z"
      />
      <Path
        fill="#34A853"
        d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.7c-1 .7-2.2 1.1-3.7 1.1-2.9 0-5.3-1.9-6.2-4.5H2.1v2.8A11 11 0 0 0 12 23z"
      />
      <Path fill="#FBBC05" d="M5.8 14.2a6.6 6.6 0 0 1 0-4.3V7.1H2.1a11 11 0 0 0 0 9.9z" />
      <Path
        fill="#EA4335"
        d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2A11 11 0 0 0 2.1 7.1l3.7 2.8C6.7 7.3 9.1 5.4 12 5.4z"
      />
    </Svg>
  );
}

export function AppleGlyph({ size = 18 }: { size?: number }) {
  const { c } = useTheme();
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        fill={c.tx}
        d="M16.4 12.6c0-2.6 2.1-3.8 2.2-3.9-1.2-1.8-3.1-2-3.7-2-1.6-.2-3.1.9-3.9.9-.8 0-2-.9-3.4-.9-1.7 0-3.3 1-4.2 2.6-1.8 3.1-.5 7.7 1.3 10.2.9 1.2 1.9 2.6 3.2 2.6 1.3-.1 1.8-.8 3.3-.8 1.6 0 2 .8 3.4.8 1.4 0 2.3-1.3 3.1-2.5 1-1.4 1.4-2.8 1.4-2.9-.1 0-2.7-1-2.7-4.1zM13.9 5.1c.7-.9 1.2-2 1-3.1-1 0-2.2.7-2.9 1.5-.6.7-1.2 1.9-1 3 1.1.1 2.2-.6 2.9-1.4z"
      />
    </Svg>
  );
}
