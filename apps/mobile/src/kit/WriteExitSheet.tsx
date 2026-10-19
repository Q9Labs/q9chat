import { ConfirmSheet } from "./Overlays";

/** Asked of someone who leaves a screen while its write is out and the connection is down. */
export function WriteExitSheet({
  title,
  onLeave,
  onStay,
}: {
  title: string;
  onLeave: () => void;
  onStay: () => void;
}) {
  return (
    <ConfirmSheet
      title={title}
      text="You're offline, so this hasn't gone through yet. It may still go through when you're back online."
      confirmLabel="Leave anyway"
      cancelLabel="Stay here"
      onConfirm={onLeave}
      onCancel={onStay}
    />
  );
}
