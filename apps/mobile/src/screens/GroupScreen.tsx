import type { ReactNode } from "react";

import { PillButton } from "../kit/Buttons";
import { CenterState, OfflinePill, Screen } from "../kit/Chrome";
import { noop } from "../kit/noop";
import { Toast } from "../kit/Overlays";
import { Timeline } from "../kit/Timeline";
import { WriteExitSheet } from "../kit/WriteExitSheet";
import type { Avatar as AvatarData, TimelineItem } from "../types";
import { ChatHeader } from "./ChatScreen";

export type GroupScreenProps = {
  history?: ReactNode;
  title: string;
  avatar: AvatarData;
  /** A quiet optional subtitle; live phone groups omit it. */
  subtitle: string | null;
  muted: boolean;
  /** Set when you were removed: the history is replaced by the removal notice. */
  removed: { by: string; when: string } | null;
  offline: boolean;
  /** Gallery fallback; live history is supplied by the journey. */
  items: readonly TimelineItem[];
  toast: string | null;
  onBack: () => void;
  onOpenInfo: () => void;
  onSearch: () => void;
  /** "Remove from my list" in the removed view. */
  onForget: () => void;
  /** Asked when someone leaves while that is still going through offline; null otherwise. */
  leavePrompt: { leave: () => void; stay: () => void } | null;
};

// The fallback timeline is display-only.
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

/** The live group header and its reading surface, or the removal notice. */
export function GroupScreen(props: GroupScreenProps) {
  return (
    <Screen safeBottom>
      <ChatHeader {...props} />
      <GroupBody {...props} />
      {props.leavePrompt ? (
        <WriteExitSheet
          title="It isn't removed yet"
          onLeave={props.leavePrompt.leave}
          onStay={props.leavePrompt.stay}
        />
      ) : null}
      {props.toast ? <Toast text={props.toast} /> : null}
    </Screen>
  );
}

function GroupBody(props: GroupScreenProps) {
  return (
    <>
      {props.removed ? (
        <CenterState
          icon="ban"
          title="You were removed from this group"
          text={`${props.removed.by} removed you ${props.removed.when}. Only members can read a group, so its messages are hidden.`}
          action={<PillButton label="Remove from my list" onPress={props.onForget} />}
        />
      ) : (
        <>
          {props.offline ? <OfflinePill /> : null}
          {props.history ?? (
            <Timeline
              items={props.items}
              typingText={null}
              latestKey={props.items.at(-1)?.id ?? ""}
              {...NO_ACTIONS}
            />
          )}
        </>
      )}
    </>
  );
}
