import type { Avatar as AvatarData } from "../chat/types.js";

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
    <span className={`av${sizeClass}`} aria-hidden="true" style={{ "--c": avatar.color }}>
      {avatar.initials}
    </span>
  );
}
