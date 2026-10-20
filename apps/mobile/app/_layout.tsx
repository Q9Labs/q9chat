import {
  Figtree_400Regular,
  Figtree_400Regular_Italic,
  Figtree_500Medium,
  Figtree_600SemiBold,
  Figtree_700Bold,
  useFonts,
} from "@expo-google-fonts/figtree";
import { useConvexConnectionState } from "convex/react";
import { Stack, useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useState } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { PhoneNotificationsProvider } from "../src/journey/PhoneNotifications";
import { SignOutProvider } from "../src/journey/SignOut";
import { useStage } from "../src/journey/useStage";
import { useStageAnswered } from "../src/journey/useStageAnswered";
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
  const stage = useStage();
  const answered = useStageAnswered(stage.kind);
  const ready = stage.kind === "ready";
  useEffect(() => {
    if (answered) void SplashScreen.hideAsync();
  }, [answered]);
  // Screenshot harness: a dev build started with EXPO_PUBLIC_GALLERY_AUTO=1 walks the gallery by itself.
  useEffect(() => {
    if (answered && __DEV__ && process.env.EXPO_PUBLIC_GALLERY_AUTO === "1")
      router.replace("/gallery/auto");
  }, [answered, router]);
  // The router starts only once it is known whether someone is signed in, with the splash up until then.
  if (!answered) return null;
  return (
    <>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.s0 } }}>
        {/* Open to everyone: a signed-out person signs in first, then lands on the invite. */}
        <Stack.Screen name="join/[token]" />
        <Stack.Protected guard={ready}>
          <Stack.Screen name="search" />
          <Stack.Screen name="account" />
          <Stack.Screen name="new-group" />
          <Stack.Screen name="g/[groupId]" />
          <Stack.Screen name="g/[groupId]/info" />
          <Stack.Screen name="g/[groupId]/add" />
        </Stack.Protected>
      </Stack>
    </>
  );
}

/** Protected photos are fetched with the access token, which changes as it refreshes. */
function Photos({ children }: { children: React.ReactNode }) {
  const state = useSessionState();
  const token = state.status === "authenticated" ? state.session.accessToken : null;
  const { isWebSocketConnected } = useConvexConnectionState();
  const auth = useMemo(
    () =>
      token
        ? {
            origin: config.siteUrl,
            headers: { Authorization: `Bearer ${token}` },
            connected: isWebSocketConnected,
          }
        : undefined,
    [token, isWebSocketConnected],
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
  if (!ready) return null;
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <SessionProvider>
          <Photos>
            <PhoneNotificationsProvider>
              <SignOutProvider>
                <Navigator />
              </SignOutProvider>
            </PhoneNotificationsProvider>
          </Photos>
        </SessionProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
