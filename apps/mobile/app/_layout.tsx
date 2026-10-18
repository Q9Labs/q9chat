import {
  Figtree_400Regular,
  Figtree_400Regular_Italic,
  Figtree_500Medium,
  Figtree_600SemiBold,
  Figtree_700Bold,
  useFonts,
} from "@expo-google-fonts/figtree";
import { Stack, useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useState } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { SignOutProvider } from "../src/journey/SignOut";
import { useStage } from "../src/journey/useStage";
import { reducedMotionLoaded } from "../src/kit/motion";
import { ImageAuthContext } from "../src/kit/photoAuth";
import { useSessionState } from "../src/session/client";
import { config } from "../src/session/config";
import { SessionProvider } from "../src/session/SessionProvider";
import { ThemeProvider, useTheme } from "../src/theme";

void SplashScreen.preventAutoHideAsync();

function Navigator() {
  const { c, scheme } = useTheme();
  const router = useRouter();
  const ready = useStage().kind === "ready";
  // Screenshot harness: a dev build started with EXPO_PUBLIC_GALLERY_AUTO=1 walks the gallery by itself.
  useEffect(() => {
    if (__DEV__ && process.env.EXPO_PUBLIC_GALLERY_AUTO === "1") router.replace("/gallery/auto");
  }, [router]);
  return (
    <>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.s0 } }}>
        <Stack.Protected guard={ready}>
          <Stack.Screen name="account" />
        </Stack.Protected>
        {/* Still backed by sample data until their journeys are wired: a link to them lands on Groups, never on fake groups. */}
        <Stack.Protected guard={false}>
          <Stack.Screen name="g/[groupId]" />
          <Stack.Screen name="new-group" />
          <Stack.Screen name="search" />
        </Stack.Protected>
      </Stack>
    </>
  );
}

/** Protected photos are fetched with the access token, which changes as it refreshes. */
function Photos({ children }: { children: React.ReactNode }) {
  const state = useSessionState();
  const token = state.status === "authenticated" ? state.session.accessToken : null;
  const auth = useMemo(
    () =>
      token ? { origin: config.siteUrl, headers: { Authorization: `Bearer ${token}` } } : undefined,
    [token],
  );
  return <ImageAuthContext.Provider value={auth}>{children}</ImageAuthContext.Provider>;
}

export default function RootLayout() {
  const [loaded, fontError] = useFonts({
    Figtree_400Regular,
    Figtree_400Regular_Italic,
    Figtree_500Medium,
    Figtree_600SemiBold,
    Figtree_700Bold,
  });
  const [motionKnown, setMotionKnown] = useState(false);
  useEffect(() => {
    void reducedMotionLoaded.then(() => setMotionKnown(true));
  }, []);
  // A font that fails to load leaves the system font in place; the app still opens.
  const ready = (loaded || fontError !== null) && motionKnown;
  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);
  if (!ready) return null;
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <SessionProvider>
          <Photos>
            <SignOutProvider>
              <Navigator />
            </SignOutProvider>
          </Photos>
        </SessionProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
