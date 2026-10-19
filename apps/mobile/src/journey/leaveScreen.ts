/** The part of the router that leaving a screen uses. */
type Leaver = { canGoBack: () => boolean; back: () => void; replace: (href: "/") => void };

/** Back, or Groups when a link opened this screen with nothing behind it. */
export function leaveScreen(router: Leaver) {
  if (router.canGoBack()) router.back();
  else router.replace("/");
}

/** People were added: the guard goes, the line is left for the screen that stays, and the form is left for where it came from, or for Groups. */
export function leaveAfterAdd(router: Leaver, release: () => void, notify: (line: string) => void) {
  release();
  // The API does not say who was added (someone may have been added meanwhile), so the line does not name anyone.
  notify("Group updated");
  leaveScreen(router);
}
