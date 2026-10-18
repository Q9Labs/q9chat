import { Redirect, useLocalSearchParams } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { stateById } from "../../src/gallery/states";
import { ThemeProvider } from "../../src/theme";

/** Renders one gallery state; `?theme=light|dark` overrides the system scheme for screenshots. */
export default function GalleryState() {
  const { state, theme } = useLocalSearchParams<{ state: string; theme?: string }>();
  if (!__DEV__) return <Redirect href="/" />;
  const found = stateById(state);
  if (!found) return <Redirect href="/gallery" />;
  const scheme = theme === "dark" || theme === "light" ? theme : undefined;
  return (
    <ThemeProvider scheme={scheme}>
      <StatusBar style={scheme === "dark" ? "light" : scheme === "light" ? "dark" : "auto"} />
      {found.render()}
    </ThemeProvider>
  );
}
