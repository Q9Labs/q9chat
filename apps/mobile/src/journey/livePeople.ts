import type { api } from "@q9chat/convex";
import type { FunctionReturnType } from "convex/server";

import type { Avatar, Person } from "../types.ts";

type Group = NonNullable<FunctionReturnType<typeof api.groups.get>>;
/** Someone `people.find` returned: an email comes only with an exact match. */
type Found = FunctionReturnType<typeof api.people.find>[number];
/** A member as `groups.get` shows them: no email. */
type Member = Extract<Group, { status: "member" }>["members"][number];
type LiveAvatar = Member["avatar"];
/** Who a screen shows: the shared fields, then what only a search result (email) or only a member (you, deleted) carries. */
type LivePerson = { id: string; name: string; fullName: string; avatar: LiveAvatar } & (
  | Pick<Found, "email">
  | Pick<Member, "isYou" | "deleted">
);

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

export const livePerson = (person: LivePerson, siteUrl: string): Person => ({
  id: person.id,
  name: person.name,
  fullName: person.fullName,
  email: "email" in person ? (person.email ?? "") : "",
  avatar: liveAvatar(person.avatar, "pair", siteUrl),
  isYou: "isYou" in person && person.isYou,
  deleted: "deleted" in person && person.deleted,
});
