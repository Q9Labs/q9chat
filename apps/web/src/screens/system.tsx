import { LogoMark } from "../ui/brand.js";
import { Icon } from "../ui/icons.js";
import { InRoot } from "../ui/overlay.js";

interface DesktopNotificationProps {
  readonly title: string;
  readonly text: string;
  readonly onOpen: () => void;
  readonly onDismiss: () => void;
}

/** The in-page stand-in for an operating-system notification, top right. */
export function DesktopNotification({ title, text, onOpen, onDismiss }: DesktopNotificationProps) {
  return (
    <InRoot>
      <div className="dn enter" role="alert">
        <button type="button" className="dx" aria-label="Close notification" onClick={onDismiss}>
          <Icon name="x" />
        </button>
        <span className="bico" aria-hidden="true">
          <Icon name="globe" />
        </span>
        <button type="button" className="dt" onClick={onOpen}>
          <b>{title}</b>
          <span>{text}</span>
          <small>chat.q9labs.ai</small>
        </button>
        <LogoMark size={40} />
      </div>
    </InRoot>
  );
}

/** The browser's own permission prompt, drawn the way the mock shows it. */
export function BrowserPermissionPrompt({
  onBlock,
  onAllow,
}: {
  readonly onBlock: () => void;
  readonly onAllow: () => void;
}) {
  return (
    <InRoot>
      <dialog open className="perm enter" aria-label="Browser permission">
        <p>
          <b>chat.q9labs.ai</b> wants to
        </p>
        <div className="pr">
          <Icon name="bell" />
          Show notifications
        </div>
        <div className="pb">
          <button type="button" onClick={onBlock}>
            Block
          </button>
          <button type="button" className="al" onClick={onAllow}>
            Allow
          </button>
        </div>
      </dialog>
    </InRoot>
  );
}
