import { NINE_PATH, Q_PATH } from "./logo-paths.js";

/** The Q9 Labs tile: white Q, Ocean 9, full-bleed near-black tile cut by its corners. */
export function LogoMark({ label, size }: { readonly label?: string; readonly size?: number }) {
  return (
    <svg
      className="mk wmk"
      style={size === undefined ? undefined : { width: size, height: size }}
      viewBox="-1 0 355 355"
      role={label === undefined ? undefined : "img"}
      aria-label={label}
      aria-hidden={label === undefined ? true : undefined}
    >
      <rect x="-1" width="355" height="355" rx="79.5" fill="#111118" />
      <path d={Q_PATH} fill="#fff" fillRule="evenodd" />
      <path d={NINE_PATH} fill="#62a8e6" fillRule="evenodd" />
    </svg>
  );
}

/** The mark followed by "Chat". The font size of the parent sets its size. */
export function Wordmark() {
  return (
    <span className="wm">
      <LogoMark label="Q9" />
      <span className="tw">Chat</span>
    </span>
  );
}
