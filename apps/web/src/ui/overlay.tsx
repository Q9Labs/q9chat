import {
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import { Icon, type IconName } from "./icons.js";
import { useRoot } from "./root.js";

/** Calls `onEscape` when Esc is pressed anywhere while the overlay is mounted. */
function useEscape(onEscape: () => void) {
  const handle = useEffectEvent(onEscape);
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      handle();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
}

const FOCUSABLE =
  "button:not(:disabled), input:not(:disabled), textarea:not(:disabled), [href], [tabindex]:not([tabindex='-1'])";

/** Moves focus into the panel on open and gives it back on close. */
function useFocusScope(panel: HTMLElement | null) {
  useEffect(() => {
    const opener = document.activeElement;
    const first = panel?.querySelector<HTMLElement>("[data-autofocus]");
    (first ?? panel)?.focus({ preventScroll: true });
    return () => {
      if (opener instanceof HTMLElement && opener.isConnected)
        opener.focus({ preventScroll: true });
    };
  }, [panel]);
}

/** Where Tab should wrap to: the far end, when focus sits on the near one. */
function wrapTarget(items: readonly HTMLElement[], backwards: boolean): HTMLElement | null {
  const first = items[0];
  const last = items.at(-1);
  if (first === undefined || last === undefined) return null;
  const near = backwards ? first : last;
  if (document.activeElement !== near) return null;
  return backwards ? last : first;
}

/** Keeps Tab and Shift+Tab inside the panel. */
function trapTab(event: KeyboardEvent<HTMLElement>) {
  if (event.key !== "Tab") return;
  const items = [...event.currentTarget.querySelectorAll<HTMLElement>(FOCUSABLE)];
  const target = wrapTarget(items, event.shiftKey);
  if (target === null) return;
  event.preventDefault();
  target.focus();
}

export function InRoot({ children }: { readonly children: ReactNode }) {
  const { root } = useRoot();
  return root === null ? null : createPortal(children, root);
}

/** The dimmed layer behind a dialog. A press on it closes the overlay; Esc does the same from the keyboard. */
function Scrim({
  onClose,
  clear = false,
}: {
  readonly onClose: () => void;
  readonly clear?: boolean;
}) {
  return (
    <div className={`scrim${clear ? " clear" : " enter"}`} role="presentation" onClick={onClose} />
  );
}

interface DialogProps {
  /** Accessible name; use the visible title's text. */
  readonly label: string;
  readonly onClose: () => void;
  readonly size?: "default" | "wide" | "top";
  readonly children: ReactNode;
}

/** A modal dialog over a scrim. Esc and a click on the scrim close it. */
export function Dialog({ label, onClose, size = "default", children }: DialogProps) {
  const [panel, setPanel] = useState<HTMLDialogElement | null>(null);
  useEscape(onClose);
  useFocusScope(panel);
  return (
    <InRoot>
      <Scrim onClose={onClose} />
      <dialog
        ref={setPanel}
        open
        className={`dlg${size === "default" ? "" : ` ${size}`} enter`}
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        onKeyDown={trapTab}
      >
        {children}
      </dialog>
    </InRoot>
  );
}

/** Dialog actions row: Cancel left of the primary action. */
export function DialogActions({
  children,
  spread = false,
}: {
  readonly children: ReactNode;
  readonly spread?: boolean;
}) {
  return (
    <div
      className="dialog-actions"
      style={spread ? { justifyContent: "space-between" } : undefined}
    >
      {children}
    </div>
  );
}

type Placement = "below-end" | "above-start" | "popover";

/** Positions `panel` against `anchor` inside `root`, keeping it 8px from every edge. */
function place(anchor: HTMLElement, panel: HTMLElement, root: HTMLElement, placement: Placement) {
  const rootBox = root.getBoundingClientRect();
  const a = anchor.getBoundingClientRect();
  const x = a.left - rootBox.left;
  const y = a.top - rootBox.top;
  const maxLeft = root.offsetWidth - panel.offsetWidth - 8;
  let left = x + a.width - panel.offsetWidth;
  let top = y + a.height + (placement === "popover" ? 4 : 6);
  if (placement === "above-start") {
    left = x;
    top = y - panel.offsetHeight - 6;
  } else if (top + panel.offsetHeight > root.offsetHeight - 8) {
    top =
      placement === "popover"
        ? root.offsetHeight - panel.offsetHeight - 8
        : y - panel.offsetHeight - 6;
  }
  panel.style.left = `${Math.max(8, Math.min(left, maxLeft))}px`;
  panel.style.top = `${Math.max(8, top)}px`;
}

/** Places the panel before first paint, so it never shows in the wrong spot. */
function useAnchored(panel: HTMLElement | null, anchor: HTMLElement | null, placement: Placement) {
  const { root } = useRoot();
  useLayoutEffect(() => {
    if (panel !== null && anchor !== null && root !== null) place(anchor, panel, root, placement);
  }, [panel, anchor, root, placement]);
}

/** Closes on a pointer press outside `panel` (and its anchor) and on Esc. */
function useDismiss(panel: HTMLElement | null, anchor: HTMLElement | null, onClose: () => void) {
  useEscape(onClose);
  const close = useEffectEvent(onClose);
  useEffect(() => {
    const onDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (panel?.contains(target) === true || anchor?.contains(target) === true) return;
      close();
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [panel, anchor]);
}

function moveFocus(event: KeyboardEvent<HTMLElement>) {
  const step = event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;
  if (step === 0) return;
  event.preventDefault();
  const items = [...event.currentTarget.querySelectorAll<HTMLElement>("[role=menuitem]")];
  const at = items.findIndex((item) => item === document.activeElement);
  items[(at + step + items.length) % items.length]?.focus();
}

interface MenuProps {
  readonly label: string;
  readonly anchor: HTMLElement | null;
  readonly placement?: "below-end" | "above-start";
  readonly onClose: () => void;
  readonly children: ReactNode;
}

/** A menu anchored to the control that opened it. Arrow keys move, Esc closes and focus returns. */
export function Menu({ label, anchor, placement = "below-end", onClose, children }: MenuProps) {
  const [panel, setPanel] = useState<HTMLDivElement | null>(null);
  useAnchored(panel, anchor, placement);
  useDismiss(panel, anchor, onClose);
  useEffect(() => {
    panel?.querySelector<HTMLElement>("[role=menuitem]")?.focus({ preventScroll: true });
    return () => anchor?.focus({ preventScroll: true });
  }, [panel, anchor]);
  return (
    <InRoot>
      <div
        ref={setPanel}
        className="menu enter"
        role="menu"
        tabIndex={-1}
        aria-label={label}
        onKeyDown={moveFocus}
      >
        {children}
      </div>
    </InRoot>
  );
}

export function MenuItem({
  icon,
  danger = false,
  onSelect,
  children,
}: {
  readonly icon?: IconName;
  readonly danger?: boolean;
  readonly onSelect: () => void;
  readonly children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={`mi${danger ? " danger" : ""}`}
      role="menuitem"
      onClick={onSelect}
    >
      {icon === undefined ? null : <Icon name={icon} />}
      {children}
    </button>
  );
}

export function MenuSeparator() {
  return <hr className="menu-separator" />;
}

interface PopoverProps {
  readonly label: string;
  readonly anchor: HTMLElement | null;
  readonly onClose: () => void;
  readonly children: ReactNode;
}

/** A 320px popover below an anchor, over a clear scrim. */
export function Popover({ label, anchor, onClose, children }: PopoverProps) {
  const [panel, setPanel] = useState<HTMLDialogElement | null>(null);
  useAnchored(panel, anchor, "popover");
  useEscape(onClose);
  useFocusScope(panel);
  return (
    <InRoot>
      <Scrim onClose={onClose} clear />
      <dialog
        ref={setPanel}
        open
        className="notifications-popover enter"
        aria-label={label}
        tabIndex={-1}
        onKeyDown={trapTab}
      >
        {children}
      </dialog>
    </InRoot>
  );
}

/** A short status message, announced politely. The caller decides how long it stays. */
export function Toast({ message }: { readonly message: string }) {
  return (
    <InRoot>
      <output className="toast enter">
        <Icon name="check" />
        <span>{message}</span>
      </output>
    </InRoot>
  );
}
