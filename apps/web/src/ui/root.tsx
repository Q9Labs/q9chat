import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type FocusEvent,
  type MouseEvent,
  type ReactNode,
} from "react";

import type { Clock } from "../chat/format.js";

interface RootContextValue {
  readonly root: HTMLElement | null;
  readonly clock: Clock;
}

const RootContext = createContext<RootContextValue>({ root: null, clock: { now: 0 } });

/** The app root element, where overlays are placed, and the reader's clock. */
export function useRoot(): RootContextValue {
  return useContext(RootContext);
}

interface TipState {
  readonly text: string;
  readonly left: number;
  readonly top: number;
  readonly side: "start" | "end" | null;
}

function tipFor(target: HTMLElement, root: HTMLElement): TipState | null {
  const text = target.dataset["tip"];
  if (text === undefined) return null;
  const rootBox = root.getBoundingClientRect();
  const box = target.getBoundingClientRect();
  const side = target.dataset["tipside"];
  if (side === "start" || side === "end") {
    return {
      text,
      side,
      left: side === "end" ? box.right - rootBox.left + 8 : box.left - rootBox.left - 8,
      top: box.top - rootBox.top + box.height / 2,
    };
  }
  return {
    text,
    side: null,
    left: box.left - rootBox.left + box.width / 2,
    top: box.top - rootBox.top - 6,
  };
}

interface AppRootProps {
  readonly children: ReactNode;
  /** `system` follows the device setting; the gallery forces one. */
  readonly theme?: "system" | "light" | "dark";
  /** The reader's now and zone; the app keeps it fresh, the gallery fixes it. */
  readonly clock: Clock;
}

/**
 * The positioned root every screen renders in. It carries the theme, anchors
 * overlays, and shows the one shared tooltip for any element with `data-tip`
 * (and `data-tipside="start" | "end"` to place it beside the element).
 */
export function AppRoot({ children, theme = "system", clock }: AppRootProps) {
  const [root, setRoot] = useState<HTMLElement | null>(null);
  const [tip, setTip] = useState<TipState | null>(null);
  const value = useMemo<RootContextValue>(() => ({ root, clock }), [root, clock]);

  const show = useCallback(
    (event: MouseEvent<HTMLElement> | FocusEvent<HTMLElement>) => {
      const hit =
        event.target instanceof Element ? event.target.closest<HTMLElement>("[data-tip]") : null;
      setTip(hit !== null && root !== null ? tipFor(hit, root) : null);
    },
    [root],
  );
  const hide = useCallback(() => setTip(null), []);

  return (
    <RootContext.Provider value={value}>
      <div
        ref={setRoot}
        className="q9"
        data-theme={theme === "system" ? undefined : theme}
        onMouseOver={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
      >
        {children}
        {tip === null ? null : <Tip tip={tip} />}
      </div>
    </RootContext.Provider>
  );
}

function Tip({ tip }: { readonly tip: TipState }) {
  const [width, setWidth] = useState(0);
  const measure = useCallback((el: HTMLElement | null) => {
    if (el !== null) setWidth(el.offsetWidth);
  }, []);
  const left = tip.side === "start" ? tip.left - width : tip.left;
  return (
    <div
      ref={measure}
      className={`tip${tip.side === null ? "" : " tside"}`}
      role="tooltip"
      style={{ left, top: tip.top }}
    >
      {tip.text}
    </div>
  );
}
