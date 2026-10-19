/** The part of the router that leaving a screen uses. */
type Leaver = { canGoBack: () => boolean; back: () => void; replace: (href: "/") => void };

/** Back, or Groups when a link opened this screen with nothing behind it. */
export function leaveScreen(router: Leaver) {
  if (router.canGoBack()) router.back();
  else router.replace("/");
}
