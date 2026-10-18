import type { CSSProperties } from "react";

import type { Avatar as AvatarData } from "../chat/types.js";

// The eight fixed avatar colors and the lightened name color used in dark mode.
export const AVATAR_COLORS: Readonly<Record<string, string>> = {
  "#0369a1": "#38bdf8",
  "#be185d": "#f472b6",
  "#b45309": "#fbbf24",
  "#0f766e": "#2dd4bf",
  "#6d28d9": "#a78bfa",
  "#c2410c": "#fb923c",
  "#4d7c0f": "#a3e635",
  "#b91c1c": "#f87171",
};

type AvatarSize = "xs" | "sm" | "md" | "lg" | "xl";

const SIZE_CLASS: Readonly<Record<AvatarSize, string>> = {
  xs: " xs",
  sm: " sm",
  md: "",
  lg: " lg",
  xl: " xl",
};

/** Round avatar: a photo, or initials on the person's color, or a neutral group chip. */
export function Avatar({
  avatar,
  size = "md",
}: {
  readonly avatar: AvatarData;
  readonly size?: AvatarSize;
}) {
  const sizeClass = SIZE_CLASS[size];
  if (avatar.photoUrl !== null) {
    return (
      <span
        className={`av photo${sizeClass}`}
        aria-hidden="true"
        style={{ backgroundImage: `url("${avatar.photoUrl}")`, backgroundSize: "cover" }}
      />
    );
  }
  if (avatar.color === null) {
    return (
      <span className={`av gav${sizeClass}`} aria-hidden="true">
        {avatar.initials}
      </span>
    );
  }
  return (
    <span
      className={`av${sizeClass}`}
      aria-hidden="true"
      style={{ "--c": avatar.color } as CSSProperties}
    >
      {avatar.initials}
    </span>
  );
}
