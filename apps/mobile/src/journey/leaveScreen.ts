import type { useRouter } from "expo-router";

/** Back, or Groups when a link opened this screen with nothing behind it. */
export function leaveScreen(router: ReturnType<typeof useRouter>) {
  if (router.canGoBack()) router.back();
  else router.replace("/");
}
