import { useEffect, useEffectEvent, type ReactNode } from "react";

import { LogoMark } from "../ui/brand.js";

interface ChatShellProps {
  readonly sidebar: ReactNode;
  /** The permission banner, shown above the main pane. */
  readonly banner?: ReactNode;
  readonly main: ReactNode;
  /** The right-hand Group info panel; when set, the layout gains a third column. */
  readonly info?: ReactNode;
  /** ⌘K (or Ctrl+K) anywhere in the app. */
  readonly onOpenSearch: () => void;
}

/** Sidebar, main pane and an optional 320px info column. */
export function ChatShell({ sidebar, banner, main, info, onOpenSearch }: ChatShellProps) {
  const open = useEffectEvent(onOpenSearch);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        open();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className={`wl${info === undefined ? "" : " withinfo"}`}>
      {sidebar}
      <main className="main">
        {banner}
        {main}
      </main>
      {info === undefined ? null : (
        <aside className="info" aria-label="Group info">
          {info}
        </aside>
      )}
    </div>
  );
}

/** The main pane before a group is picked. */
export function PickAGroup() {
  return (
    <div className="center">
      <LogoMark size={56} />
      <p style={{ marginTop: 10 }}>Pick a group to read it.</p>
    </div>
  );
}
