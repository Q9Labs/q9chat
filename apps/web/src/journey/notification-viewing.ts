import type { Id } from "@q9chat/convex";

type Viewing = (args: { endpoint: string; groupId: Id<"groups"> | null }) => Promise<unknown>;
function focused() {
  return document.visibilityState === "visible" && document.hasFocus();
}
async function holdLease(
  viewing: Viewing,
  endpoint: string,
  groupId: Id<"groups"> | null,
  released: Promise<void>,
  onError: () => void,
) {
  const update = () => viewing({ endpoint, groupId });
  const timer = window.setInterval(() => {
    void update().catch(onError);
  }, 30_000);
  try {
    await update();
    await released;
  } finally {
    window.clearInterval(timer);
    await viewing({ endpoint, groupId: null });
  }
}
export function trackDesktopViewing(
  viewing: Viewing,
  endpoint: string,
  groupId: Id<"groups"> | null,
  onError: () => void,
) {
  if (!("locks" in navigator)) return () => {};
  const controller = new AbortController();
  let pending = false;
  let release: (() => void) | undefined;
  const update = () => {
    if (!focused()) {
      release?.();
      return;
    }
    if (pending) return;
    pending = true;
    void navigator.locks
      .request("q9chat-notification-viewing", { signal: controller.signal }, async () => {
        if (!focused()) return;
        const released = new Promise<void>((resolve) => {
          release = resolve;
        });
        await holdLease(viewing, endpoint, groupId, released, onError);
      })
      .then(
        () => {
          pending = false;
          if (focused() && !controller.signal.aborted) update();
        },
        () => {
          pending = false;
          if (!controller.signal.aborted) onError();
        },
      );
  };
  document.addEventListener("visibilitychange", update);
  window.addEventListener("focus", update);
  window.addEventListener("blur", update);
  update();
  return () => {
    controller.abort();
    release?.();
    document.removeEventListener("visibilitychange", update);
    window.removeEventListener("focus", update);
    window.removeEventListener("blur", update);
  };
}
