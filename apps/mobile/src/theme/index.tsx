import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useColorScheme } from "react-native";

import { palettes, type Palette, type SchemeName } from "./tokens";

type Theme = { scheme: SchemeName; c: Palette };

const ThemeContext = createContext<Theme | null>(null);

export function ThemeProvider({
  scheme,
  children,
}: {
  scheme?: SchemeName | undefined;
  children: ReactNode;
}) {
  const system = useColorScheme();
  const resolved: SchemeName = scheme ?? (system === "dark" ? "dark" : "light");
  const value = useMemo<Theme>(
    () => ({ scheme: resolved, c: palettes[resolved].base }),
    [resolved],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** Swaps in the raised dark surfaces for everything inside a sheet, dialog or menu. */
export function RaisedSurface({ children }: { children: ReactNode }) {
  const { scheme } = useTheme();
  const value = useMemo<Theme>(() => ({ scheme, c: palettes[scheme].raised }), [scheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const theme = useContext(ThemeContext);
  if (!theme) throw new Error("useTheme must run inside ThemeProvider");
  return theme;
}
