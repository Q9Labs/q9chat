// Ported from the approved mock's `.q` custom properties; the mock is the acceptance reference.
export type Palette = {
  bg: string;
  s0: string;
  s1: string;
  s2: string;
  s3: string;
  side: string;
  ln: string;
  ln2: string;
  wash: string;
  tx: string;
  tx2: string;
  mu: string;
  ac: string;
  onAc: string;
  acw: string;
  er: string;
  er2: string;
  pop: string;
  shadow: string;
  scrim: string;
};

export type SchemeName = "light" | "dark";

const light: Palette = {
  bg: "#f3f3f5",
  s0: "#ffffff",
  s1: "#ececf0",
  s2: "#e1e1e6",
  s3: "#d3d3d9",
  side: "#ffffff",
  ln: "rgba(0,0,0,0.09)",
  ln2: "rgba(0,0,0,0.15)",
  wash: "rgba(0,0,0,0.04)",
  tx: "#18181b",
  tx2: "#3d3e45",
  mu: "#5c5d65",
  ac: "#0b5394",
  onAc: "#ffffff",
  // 13% accent over white
  acw: "#dfe9f1",
  er: "#bf272c",
  er2: "#d93a3f",
  pop: "#ffffff",
  shadow: "0 0 0 1px rgba(0,0,0,0.08), 0 12px 32px rgba(0,0,0,0.12)",
  scrim: "rgba(0,0,0,0.4)",
};

const dark: Palette = {
  bg: "#0b0c0e",
  s0: "#151619",
  s1: "#1d1f23",
  s2: "#272a2f",
  s3: "#30333a",
  side: "#1d1f23",
  ln: "rgba(255,255,255,0.08)",
  ln2: "rgba(255,255,255,0.14)",
  wash: "rgba(255,255,255,0.05)",
  tx: "#ececee",
  tx2: "#c4c6cc",
  mu: "#9a9ca3",
  ac: "#62a8e6",
  onAc: "#0b0c0e",
  // 20% accent over the base surface
  acw: "#243342",
  er: "#ff6b6b",
  er2: "#e5484d",
  pop: "#1d1f23",
  shadow: "0 0 0 1px rgba(255,255,255,0.1), 0 12px 32px rgba(0,0,0,0.5)",
  scrim: "rgba(0,0,0,0.55)",
};

// Sheets, dialogs and menus sit on a raised surface in dark mode (the mock's `.sheet` overrides).
const darkRaised: Palette = { ...dark, s0: "#1d1f23", s1: "#272a2f", s2: "#30333a", s3: "#3a3d45" };

export const palettes: Record<SchemeName, { base: Palette; raised: Palette }> = {
  light: { base: light, raised: light },
  dark: { base: dark, raised: darkRaised },
};

export const radius = {
  menu: 12,
  input: 12,
  card: 16,
  bubble: 18,
  sheet: 24,
  pill: 999,
} as const;

// Motion from design.md: moves 220ms on cubic-bezier(0.16, 1, 0.3, 1), transform and opacity only.
export const motion = {
  press: 150,
  chip: 120,
  scrim: 180,
  sheet: 240,
  toast: 200,
  messageIn: 220,
  pop: 300,
  ease: [0.16, 1, 0.3, 1],
} as const;

export const fonts = {
  400: "Figtree_400Regular",
  500: "Figtree_500Medium",
  600: "Figtree_600SemiBold",
  700: "Figtree_700Bold",
} as const;

/** The only italic the mock uses: "You deleted this message". */
export const italicFont = "Figtree_400Regular_Italic";

export type Weight = keyof typeof fonts;

export type ColorRef = keyof Palette | (string & {});

const isToken = (key: string): key is keyof Palette => key in light;

/** A palette token name or a literal color, resolved against the active palette. */
export const resolveColor = (c: Palette, color: ColorRef): string =>
  isToken(color) ? c[color] : color;
