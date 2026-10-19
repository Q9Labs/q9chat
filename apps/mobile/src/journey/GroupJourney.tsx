import { api, type Id } from "@q9chat/convex";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useRouter } from "expo-router";

import { useToast } from "../kit/useToast";
import { GroupScreen } from "../screens/GroupScreen";
import { config } from "../session/config";
import { eventItems } from "./groupEvents";
import { rowStamp } from "./groupRows";
import { GroupUnavailable } from "./GroupUnavailable";
import { liveAvatar } from "./livePeople";
import { Loading } from "./Loading";
import { useOffline } from "./useOffline";

const COMING_NEXT = "This is coming in the next journey.";
/** Member events of the latest page of history; a group with more than this shows its newest. */
const PAGE = 100;

type Detail = NonNullable<FunctionReturnType<typeof api.groups.get>>;
type Range = FunctionReturnType<typeof api.messages.range> | undefined;

function GroupView({
  groupId,
  detail,
  range,
}: {
  groupId: Id<"groups">;
  detail: Detail;
  range: Range;
}) {
  const router = useRouter();
  const [toast, showToast] = useToast();
  const offline = useOffline();
  const base = {
    title: detail.title,
    avatar: liveAvatar(
      detail.avatar,
      detail.status === "member" ? detail.kind : "group",
      config.siteUrl,
    ),
    offline,
    toast,
    onBack: () => router.back(),
    onOpenInfo: () => router.push({ pathname: "/g/[groupId]/info", params: { groupId } }),
    onSearch: () => showToast(COMING_NEXT),
  };
  if (detail.status === "removed")
    return (
      <GroupScreen
        {...base}
        subtitle={null}
        muted={false}
        removed={{ by: detail.removedBy.name, when: rowStamp(detail.removedAt, new Date()) }}
        items={[]}
      />
    );
  const events = (range ?? []).flatMap((row) =>
    row.kind === "event" ? [{ id: row.id, event: row.event }] : [],
  );
  return (
    <GroupScreen
      {...base}
      subtitle={detail.kind === "group" ? `${detail.memberCount} members` : null}
      muted={detail.notify === "muted"}
      removed={null}
      items={eventItems(detail.kind, detail.partner, events)}
    />
  );
}

/** An opened group in journey 2: its header and member events. Reading posts is phone journey 3. */
export function GroupJourney({ groupId }: { groupId: Id<"groups"> }) {
  const offline = useOffline();
  const detail = useQuery(api.groups.get, { groupId });
  const last = detail?.status === "member" ? detail.lastSequence : 0;
  const range = useQuery(
    api.messages.range,
    last > 0 ? { groupId, fromSequence: Math.max(1, last - PAGE + 1), toSequence: last } : "skip",
  );
  if (detail === undefined && !offline) return <Loading />;
  if (!detail) return <GroupUnavailable denied={detail === null} />;
  return <GroupView groupId={groupId} detail={detail} range={range} />;
}
