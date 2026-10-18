import { avatarColors, firstName, messageSummary, eventSentence } from "@q9chat/domain";

import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
export async function person(
  ctx: Pick<QueryCtx, "db">,
  id: Id<"profiles">,
  viewer: Id<"profiles">,
) {
  const profile = await ctx.db.get(id);
  const deleted = !profile || profile.status !== "active";
  const fullName =
    !profile || profile.status !== "active" ? "Deleted account" : profile.displayName;
  return {
    id,
    name: deleted ? fullName : firstName(fullName),
    fullName,
    isYou: id === viewer,
    deleted,
    avatar: {
      ...avatarColors(id),
      initials: deleted
        ? ""
        : fullName
            .trim()
            .split(/\s+/u)
            .slice(0, 2)
            .map((word) => word[0] ?? "")
            .join("")
            .toUpperCase(),
      photo: profile?.status === "active" && profile.photoStorageId ? `/photos/${id}` : null,
    },
  };
}
export function personCache(ctx: Pick<QueryCtx, "db">, viewer: Id<"profiles">) {
  const people = new Map<Id<"profiles">, ReturnType<typeof person>>();
  return (id: Id<"profiles">) => {
    let result = people.get(id);
    if (!result) {
      result = person(ctx, id, viewer);
      people.set(id, result);
    }
    return result;
  };
}
type ResolvePerson = ReturnType<typeof personCache>;
export async function groupDisplay(
  ctx: Pick<QueryCtx, "db">,
  group: Doc<"groups">,
  viewer: Id<"profiles">,
  resolve: ResolvePerson = personCache(ctx, viewer),
) {
  if (group.kind === "group")
    return {
      title: group.name,
      avatar: {
        ...avatarColors(group._id),
        initials: group.name.slice(0, 2).toUpperCase(),
        photo: null,
      },
      partner: null,
    };
  const ids = group.pairKey.split(":");
  const partnerId = ids.find((id) => id !== viewer);
  const id = partnerId ? ctx.db.normalizeId("profiles", partnerId) : null;
  const partner = id ? await resolve(id) : null;
  return {
    title: partner?.fullName ?? "Deleted account",
    avatar: partner?.avatar ?? { ...avatarColors(group._id), initials: "", photo: null },
    partner,
  };
}
export async function resolvedEvent(
  ctx: Pick<QueryCtx, "db">,
  event: Extract<Doc<"messages">, { kind: "event" }>["event"],
  viewer: Id<"profiles">,
  resolve: ResolvePerson = personCache(ctx, viewer),
) {
  switch (event.type) {
    case "created":
      return { type: event.type, by: await resolve(event.by) };
    case "added":
      return {
        type: event.type,
        by: await resolve(event.by),
        people: await Promise.all(event.profileIds.slice(0, 3).map(resolve)),
        othersCount: Math.max(0, event.profileIds.length - 3),
      };
    case "joined":
    case "left":
      return { type: event.type, person: await resolve(event.profileId) };
    case "removed":
      return {
        type: event.type,
        by: await resolve(event.by),
        person: await resolve(event.profileId),
      };
  }
  throw new Error("Unknown member event");
}
export async function preview(
  ctx: Pick<QueryCtx, "db">,
  message: Doc<"messages"> | null,
  viewer: Id<"profiles">,
  resolve: ResolvePerson = personCache(ctx, viewer),
) {
  if (!message) return { by: null, summary: "" };
  if (message.kind === "event")
    return {
      by: null,
      summary: eventSentence(await resolvedEvent(ctx, message.event, viewer, resolve)),
    };
  return { by: await resolve(message.authorId), summary: messageSummary(message) };
}
