import { noop } from "../kit/noop";
import type { AccountScreenProps } from "../screens/AccountScreen";
import type { ChatScreenProps } from "../screens/ChatScreen";
import type { GroupsScreenProps } from "../screens/GroupsScreen";
import type { InfoScreenProps } from "../screens/InfoScreen";
import type { NewGroupScreenProps } from "../screens/NewGroupScreen";
import type { SearchScreenProps } from "../screens/SearchScreen";

export const groupsHandlers: Pick<
  GroupsScreenProps,
  "onOpenGroup" | "onNewGroup" | "onAccount" | "onSearch" | "onNotNow" | "onTurnOn"
> = {
  onOpenGroup: noop,
  onNewGroup: noop,
  onAccount: noop,
  onSearch: noop,
  onNotNow: noop,
  onTurnOn: noop,
};

export const chatHandlers: Omit<
  ChatScreenProps,
  | "title"
  | "avatar"
  | "subtitle"
  | "muted"
  | "removed"
  | "offline"
  | "items"
  | "typingText"
  | "latestKey"
  | "tappedMessageId"
  | "playingMessageId"
  | "playProgress"
  | "poppedReaction"
  | "composer"
  | "draft"
  | "sheet"
  | "toast"
> = {
  onBack: noop,
  onOpenInfo: noop,
  onSearch: noop,
  onDraftChange: noop,
  onSend: noop,
  onAttach: noop,
  onAttachPick: noop,
  onRecord: noop,
  onRecordCancel: noop,
  onRecordSend: noop,
  onCancelComposerMode: noop,
  onToggleTime: noop,
  onOpenMessageSheet: noop,
  onOpenReactions: noop,
  onReact: noop,
  onRetry: noop,
  onQuotePress: noop,
  onTogglePlay: noop,
  onAuthorPress: noop,
  onReply: noop,
  onEdit: noop,
  onCopy: noop,
  onAskDelete: noop,
  onConfirmDelete: noop,
  onAskReport: noop,
  onPickReportReason: noop,
  onSendReport: noop,
  onCloseSheet: noop,
  onForget: noop,
};

export const infoHandlers: Omit<InfoScreenProps, "info" | "sheet" | "copied" | "toast"> = {
  onBack: noop,
  onAddPeople: noop,
  onCopyLink: noop,
  onSearch: noop,
  onOpenNotify: noop,
  onChooseNotify: noop,
  onToggleMute: noop,
  onOpenMember: noop,
  onMessageMember: noop,
  onAskRemove: noop,
  onConfirmRemove: noop,
  onAskLeave: noop,
  onConfirmLeave: noop,
  onCloseSheet: noop,
};

export const newGroupHandlers: Pick<
  NewGroupScreenProps,
  | "onGroupNameChange"
  | "onQueryChange"
  | "onPick"
  | "onUnpick"
  | "onCopyLink"
  | "onPrimary"
  | "onCancel"
> = {
  onGroupNameChange: noop,
  onQueryChange: noop,
  onPick: noop,
  onUnpick: noop,
  onCopyLink: noop,
  onPrimary: noop,
  onCancel: noop,
};

export const searchHandlers: Pick<
  SearchScreenProps,
  "onQueryChange" | "onClearScope" | "onOpenHit" | "onCancel"
> = {
  onQueryChange: noop,
  onClearScope: noop,
  onOpenHit: noop,
  onCancel: noop,
};

export const accountHandlers: Pick<
  AccountScreenProps,
  | "onNameChange"
  | "nameSaving"
  | "unsaved"
  | "onTogglePhoto"
  | "onBack"
  | "onSignOut"
  | "signingOut"
  | "onAskDelete"
  | "onConfirmDelete"
  | "onCancelDelete"
> = {
  onNameChange: noop,
  nameSaving: false,
  unsaved: null,
  onTogglePhoto: noop,
  onBack: noop,
  onSignOut: noop,
  signingOut: false,
  onAskDelete: noop,
  onConfirmDelete: noop,
  onCancelDelete: noop,
};
