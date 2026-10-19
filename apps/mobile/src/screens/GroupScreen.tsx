import { CenterState, OfflinePill, Screen } from "../kit/Chrome";
import { noop } from "../kit/noop";
import { Toast } from "../kit/Overlays";
import { Timeline } from "../kit/Timeline";
import type { Avatar as AvatarData, TimelineItem } from "../types";
import { ChatHeader } from "./ChatScreen";

export type GroupScreenProps = {
  title: string;
  avatar: AvatarData;
  /** "5 members" for groups; null for a pair. */
  subtitle: string | null;
  muted: boolean;
  /** Set when you were removed: the history is replaced by the removal notice. */
  removed: { by: string; when: string } | null;
  offline: boolean;
  /** Member events only; reading messages comes with phone journey 3. */
  items: readonly TimelineItem[];
  toast: string | null;
  onBack: () => void;
  onOpenInfo: () => void;
  onSearch: () => void;
};

// Posts are not shown yet, so nothing in the timeline can be tapped.
const NO_ACTIONS = {
  tappedId: null,
  playingId: null,
  playProgress: 0,
  poppedReaction: null,
  onToggleTime: noop,
  onOpenSheet: noop,
  onRetry: noop,
  onQuotePress: noop,
  onReactionPress: noop,
  onReactionLongPress: noop,
  onTogglePlay: noop,
  onAuthorPress: noop,
};

/** An opened group in journey 2: the chat header over the group's member events. */
export function GroupScreen(props: GroupScreenProps) {
  return (
    <Screen>
      <ChatHeader {...props} />
      {props.removed ? (
        <CenterState
          icon="ban"
          title="You were removed from this group"
          text={`${props.removed.by} removed you ${props.removed.when}. Only members can read a group, so its messages are hidden.`}
        />
      ) : (
        <>
          {props.offline ? <OfflinePill /> : null}
          <Timeline
            items={props.items}
            typingText={null}
            latestKey={props.items.at(-1)?.id ?? ""}
            {...NO_ACTIONS}
          />
        </>
      )}
      {props.toast ? <Toast text={props.toast} /> : null}
    </Screen>
  );
}
