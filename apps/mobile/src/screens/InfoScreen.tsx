import { ScrollView, View } from "react-native";

import { Avatar } from "../kit/Avatar";
import { IconButton } from "../kit/Buttons";
import { PageNav, Screen } from "../kit/Chrome";
import { RadioList, Switch, type RadioOption } from "../kit/Controls";
import { LinkBox, Note } from "../kit/Field";
import { Icon, type IconName } from "../kit/Icon";
import { ConfirmSheet, Sheet, SheetRow, SheetTitle, Toast } from "../kit/Overlays";
import { Press } from "../kit/Press";
import { useTheme } from "../theme";
import { T } from "../theme/Text";
import type { Avatar as AvatarData, GroupInfo, Member, Notify } from "../types";

const NOTIFY_LABEL: Record<Notify, string> = {
  mentions: "Mentions and replies",
  all: "All messages",
  muted: "Muted",
};
const NOTIFY_HINT: Record<Notify, string> = {
  mentions: "Only when someone mentions you or replies to you.",
  all: "Every new message in this group.",
  muted: "No notifications. The unread count turns grey.",
};
const NOTIFY_ICON: Record<Notify, IconName> = {
  mentions: "bell",
  all: "bellAll",
  muted: "bellOff",
};

const NOTIFY_OPTIONS: readonly RadioOption<Notify>[] = [
  {
    value: "mentions",
    label: NOTIFY_LABEL.mentions,
    hint: NOTIFY_HINT.mentions,
    suffix: "Default",
  },
  { value: "all", label: NOTIFY_LABEL.all, hint: NOTIFY_HINT.all },
  { value: "muted", label: NOTIFY_LABEL.muted, hint: NOTIFY_HINT.muted },
];

export type InfoSheet =
  | { type: "notify" }
  | { type: "member"; personId: string }
  | { type: "removeMember"; personId: string }
  | { type: "leave" };

export type InfoScreenProps = {
  info:
    | ({ status: "member" } & GroupInfo)
    | { status: "removed"; title: string; avatar: AvatarData; memberCount: number };
  sheet: InfoSheet | null;
  copied: boolean;
  toast: string | null;
  onBack: () => void;
  onAddPeople: () => void;
  onCopyLink: () => void;
  onSearch: () => void;
  onOpenNotify: () => void;
  onChooseNotify: (notify: Notify) => void;
  onToggleMute: (muted: boolean) => void;
  onOpenMember: (personId: string) => void;
  onMessageMember: (personId: string) => void;
  onAskRemove: (personId: string) => void;
  onConfirmRemove: (personId: string) => void;
  onAskLeave: () => void;
  onConfirmLeave: () => void;
  onCloseSheet: () => void;
};

function Hero({ avatar, title, line }: { avatar: AvatarData; title: string; line: string }) {
  return (
    <View
      style={{
        alignItems: "center",
        gap: 2,
        paddingTop: 8,
        paddingHorizontal: 20,
        paddingBottom: 16,
      }}
    >
      <Avatar avatar={avatar} size={72} />
      <T
        size={17}
        weight={600}
        style={{ marginTop: 10, textAlign: "center" }}
        accessibilityRole="header"
      >
        {title}
      </T>
      <T size={13} color="mu" style={{ textAlign: "center" }}>
        {line}
      </T>
    </View>
  );
}

function QuickAction({
  icon,
  label,
  onPress,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
}) {
  const { c } = useTheme();
  return (
    <Press
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      scaleTo={1}
      style={{ width: 68, alignItems: "center", gap: 6 }}
    >
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 22,
          backgroundColor: c.side,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon name={icon} size={20} color="tx" />
      </View>
      <T size={12} weight={500} color="tx2" lineHeight={16.8}>
        {label}
      </T>
    </Press>
  );
}

function SectionTitle({ children }: { children: string }) {
  return (
    <T
      size={12}
      weight={600}
      color="mu"
      style={{ marginTop: 4, marginHorizontal: 12, marginBottom: 4 }}
    >
      {children}
    </T>
  );
}

function InfoRow({
  icon,
  label,
  hint,
  onPress,
  chevron,
  danger,
}: {
  icon: IconName;
  label: string;
  hint?: string;
  onPress: () => void;
  chevron?: boolean;
  danger?: boolean;
}) {
  return (
    <Press
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      scaleTo={1}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        minHeight: 48,
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: 12,
      }}
    >
      <Icon name={icon} size={20} color={danger ? "er" : "mu"} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <T color={danger ? "er" : "tx"} weight={danger ? 500 : 400}>
          {label}
        </T>
        {hint ? (
          <T size={12} color="mu">
            {hint}
          </T>
        ) : null}
      </View>
      {chevron ? <Icon name="chev" size={16} color="mu" /> : null}
    </Press>
  );
}

function MemberRow({ member, onOptions }: { member: Member; onOptions: () => void }) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        minHeight: 52,
        paddingVertical: 6,
        paddingStart: 12,
        paddingEnd: 8,
        borderRadius: 12,
      }}
    >
      <Avatar avatar={member.avatar} size={28} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <T weight={600} numberOfLines={1}>
          {member.isYou ? `${member.fullName} (you)` : member.name}
        </T>
        <T size={12} color="mu" numberOfLines={1}>
          {member.email}
        </T>
      </View>
      {member.isYou ? null : (
        <IconButton
          icon="more"
          label={`Options for ${member.name}`}
          size={36}
          onPress={onOptions}
        />
      )}
    </View>
  );
}

const sectionStyle = { paddingHorizontal: 8, paddingBottom: 16 } as const;

function QuickActions(props: Pick<InfoScreenProps, "onAddPeople" | "onCopyLink" | "onSearch">) {
  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "center",
        gap: 20,
        paddingHorizontal: 16,
        paddingBottom: 20,
      }}
    >
      <QuickAction icon="userPlus" label="Add people" onPress={props.onAddPeople} />
      <QuickAction icon="link" label="Invite link" onPress={props.onCopyLink} />
      <QuickAction icon="search" label="Search" onPress={props.onSearch} />
    </View>
  );
}

function NotifySection({
  notify,
  onOpenNotify,
  onToggleMute,
}: { notify: Notify } & Pick<InfoScreenProps, "onOpenNotify" | "onToggleMute">) {
  return (
    <View style={sectionStyle}>
      <SectionTitle>Notifications</SectionTitle>
      <InfoRow
        icon={NOTIFY_ICON[notify]}
        label={NOTIFY_LABEL[notify]}
        hint={NOTIFY_HINT[notify]}
        chevron
        onPress={onOpenNotify}
      />
      <Switch label="Mute this group" on={notify === "muted"} onChange={onToggleMute}>
        <Icon name="bellOff" size={20} color="mu" />
        <T style={{ flex: 1 }}>Mute this group</T>
      </Switch>
    </View>
  );
}

function GroupSections({ info, props }: { info: GroupInfo; props: InfoScreenProps }) {
  return (
    <>
      <View style={sectionStyle}>
        <SectionTitle>{`${info.memberCount} members`}</SectionTitle>
        <InfoRow icon="userPlus" label="Add people" onPress={props.onAddPeople} />
        {info.members.map((m) => (
          <MemberRow key={m.id} member={m} onOptions={() => props.onOpenMember(m.id)} />
        ))}
      </View>
      {info.inviteLink ? (
        <View style={sectionStyle}>
          <SectionTitle>Invite link</SectionTitle>
          <LinkBox link={info.inviteLink} copied={props.copied} onCopy={props.onCopyLink} />
          <Note>Anyone with the link can join and read the whole group.</Note>
        </View>
      ) : null}
      <View style={sectionStyle}>
        <InfoRow danger icon="logout" label="Leave group" onPress={props.onAskLeave} />
      </View>
    </>
  );
}

function MemberBody({ info, props }: { info: GroupInfo; props: InfoScreenProps }) {
  const isGroup = info.kind === "group";
  return (
    <ScrollView showsVerticalScrollIndicator={false}>
      <Hero
        avatar={info.avatar}
        title={info.title}
        line={info.kind === "pair" ? (info.partnerEmail ?? "") : `${info.memberCount} members`}
      />
      {isGroup ? <QuickActions {...props} /> : null}
      <NotifySection
        notify={info.notify}
        onOpenNotify={props.onOpenNotify}
        onToggleMute={props.onToggleMute}
      />
      {isGroup ? <GroupSections info={info} props={props} /> : null}
    </ScrollView>
  );
}

function MemberOptions({ member, props }: { member: Member; props: InfoScreenProps }) {
  return (
    <Sheet label={`Options for ${member.name}`} onDismiss={props.onCloseSheet}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          paddingHorizontal: 4,
          paddingBottom: 14,
        }}
      >
        <Avatar avatar={member.avatar} size={28} />
        <T size={14} color="mu" numberOfLines={1} style={{ flex: 1 }}>
          <T size={14} weight={600}>
            {member.name}
          </T>
          {` · ${member.email}`}
        </T>
      </View>
      <SheetRow
        first
        icon="chat"
        label={`Message ${member.name}`}
        onPress={() => props.onMessageMember(member.id)}
      />
      <SheetRow
        danger
        icon="ban"
        label="Remove from group"
        onPress={() => props.onAskRemove(member.id)}
      />
    </Sheet>
  );
}

function RemoveConfirm({
  info,
  personId,
  props,
}: {
  info: GroupInfo;
  personId: string;
  props: InfoScreenProps;
}) {
  const name = info.members.find((m) => m.id === personId)?.name ?? "They";
  return (
    <ConfirmSheet
      title={`Remove ${name}?`}
      text={`${name} loses access to ${info.title} and its history. Everyone in the group sees that you removed ${name}.`}
      confirmLabel={`Remove ${name}`}
      onConfirm={() => props.onConfirmRemove(personId)}
      onCancel={props.onCloseSheet}
    />
  );
}

function InfoSheets({
  info,
  sheet,
  props,
}: {
  info: GroupInfo;
  sheet: InfoSheet;
  props: InfoScreenProps;
}) {
  if (sheet.type === "notify") {
    return (
      <Sheet label="Notifications" onDismiss={props.onCloseSheet}>
        <SheetTitle>{`Notifications for ${info.title}`}</SheetTitle>
        <RadioList<Notify>
          label="Notifications"
          value={info.notify}
          onChange={props.onChooseNotify}
          options={NOTIFY_OPTIONS}
        />
      </Sheet>
    );
  }
  if (sheet.type === "leave") {
    return (
      <ConfirmSheet
        title={`Leave ${info.title}?`}
        text="You lose access to the group and its history. A member can add you back."
        confirmLabel="Leave group"
        onConfirm={props.onConfirmLeave}
        onCancel={props.onCloseSheet}
      />
    );
  }
  const member = info.members.find((m) => m.id === sheet.personId);
  if (!member) return null;
  if (sheet.type === "member") return <MemberOptions member={member} props={props} />;
  return <RemoveConfirm info={info} personId={sheet.personId} props={props} />;
}

/** Group info page: hero, quick actions, notifications, members, invite link and leave. */
export function InfoScreen(props: InfoScreenProps) {
  const { info, sheet } = props;
  return (
    <Screen safeBottom>
      <PageNav title="Group info" start={{ back: true, onPress: props.onBack }} />
      {info.status === "removed" ? (
        <ScrollView>
          <Hero avatar={info.avatar} title={info.title} line={`${info.memberCount} members`} />
          <Note style={{ textAlign: "center" }}>You were removed from this group.</Note>
        </ScrollView>
      ) : (
        <MemberBody info={info} props={props} />
      )}
      {sheet && info.status === "member" ? (
        <InfoSheets info={info} sheet={sheet} props={props} />
      ) : null}
      {props.toast ? <Toast text={props.toast} /> : null}
    </Screen>
  );
}
