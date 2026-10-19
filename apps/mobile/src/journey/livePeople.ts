import type { Avatar, Person } from "../types";

/** The avatar every query result carries; a group has no color, a pair or a person has one. */
type LiveAvatar = { color: string; lightColor: string; initials: string; photo: string | null };

/** The URL of a protected photo on the Convex HTTP origin; the Avatar sends the access token with it. */
export const photoUrlOf = (siteUrl: string, path: string | null) =>
  path ? `${siteUrl}${path}` : null;

export const liveAvatar = (avatar: LiveAvatar, kind: "group" | "pair", siteUrl: string): Avatar =>
  kind === "group"
    ? { kind: "group", initials: avatar.initials }
    : {
        kind: "person",
        initials: avatar.initials,
        color: avatar.color,
        colorOnDark: avatar.lightColor,
        photoUrl: photoUrlOf(siteUrl, avatar.photo),
      };

type LivePerson = {
  id: string;
  name: string;
  fullName: string;
  /** Only `people.find` on an exact email match carries one; everyone else is shown without. */
  email?: string | null;
  isYou?: boolean;
  deleted?: boolean;
  avatar: LiveAvatar;
};

export const livePerson = (person: LivePerson, siteUrl: string): Person => ({
  id: person.id,
  name: person.name,
  fullName: person.fullName,
  email: person.email ?? "",
  avatar: liveAvatar(person.avatar, "pair", siteUrl),
  isYou: person.isYou ?? false,
  deleted: person.deleted ?? false,
});
