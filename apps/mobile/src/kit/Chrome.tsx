import type { ReactNode } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTheme } from "../theme";
import { T } from "../theme/Text";
import { radius } from "../theme/tokens";
import type { Avatar as AvatarData } from "../types";
import { Avatar } from "./Avatar";
import { IconButton, PillButton } from "./Buttons";
import { Icon } from "./Icon";
import { Wordmark } from "./Logo";
import { Press } from "./Press";

/** A full phone screen: the surface plus the top inset; `safeBottom` also keeps the bottom inset. */
export function Screen({ children, safeBottom }: { children: ReactNode; safeBottom?: boolean }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: c.s0,
        paddingTop: insets.top,
        paddingBottom: safeBottom ? insets.bottom : 0,
      }}
    >
      {children}
    </View>
  );
}

type NavStart = { label?: string; back?: boolean; onPress: () => void; disabled?: boolean };
type NavEnd = { label: string; onPress: () => void; disabled?: boolean; strong?: boolean };

function NavStartButton({ start }: { start: NavStart }) {
  return (
    <Press
      accessibilityRole="button"
      accessibilityLabel={start.back ? "Back" : (start.label ?? "Back")}
      accessibilityState={{ disabled: !!start.disabled }}
      disabled={start.disabled}
      onPress={start.onPress}
      scaleTo={1}
      style={{
        minHeight: 44,
        flexDirection: "row",
        alignItems: "center",
        gap: 2,
        opacity: start.disabled ? 0.35 : 1,
      }}
    >
      {start.back ? (
        <Icon name="back" size={24} color="tx" />
      ) : (
        <T size={16} color="tx">
          {start.label ?? ""}
        </T>
      )}
    </Press>
  );
}

function NavEndButton({ end }: { end: NavEnd }) {
  return (
    <Press
      accessibilityRole="button"
      accessibilityState={{ disabled: !!end.disabled }}
      disabled={end.disabled}
      onPress={end.onPress}
      scaleTo={1}
      style={{ minHeight: 44, justifyContent: "center", opacity: end.disabled ? 0.35 : 1 }}
    >
      <T size={16} weight={end.strong ? 600 : 400}>
        {end.label}
      </T>
    </Press>
  );
}

/** Page header: a text or icon button on each side and a centered 17px title. */
export function PageNav({ title, start, end }: { title: string; start?: NavStart; end?: NavEnd }) {
  return (
    <View
      style={{
        minHeight: 52,
        paddingHorizontal: 12,
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
      }}
    >
      <View style={{ minWidth: 64, minHeight: 44 }}>
        {start ? <NavStartButton start={start} /> : null}
      </View>
      <T
        size={17}
        weight={600}
        numberOfLines={1}
        accessibilityRole="header"
        style={{ flex: 1, textAlign: "center" }}
      >
        {title}
      </T>
      <View style={{ minWidth: 64, minHeight: 44, alignItems: "flex-end" }}>
        {end ? <NavEndButton end={end} /> : null}
      </View>
    </View>
  );
}

/** Groups header: wordmark, New group, and your avatar as the Account button. */
export function GroupsTop({
  me,
  onNewGroup,
  onAccount,
}: {
  me: AvatarData;
  onNewGroup: () => void;
  onAccount: () => void;
}) {
  const { c } = useTheme();
  return (
    <View
      style={{
        minHeight: 56,
        paddingStart: 20,
        paddingEnd: 12,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <Wordmark size={22} />
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <IconButton
          icon="plus"
          label="New group"
          size={40}
          color="tx"
          background={c.s1}
          onPress={onNewGroup}
        />
        <Press
          accessibilityRole="button"
          accessibilityLabel="Account"
          onPress={onAccount}
          scaleTo={1}
          style={{ borderRadius: 18 }}
        >
          <Avatar avatar={me} size={36} />
        </Press>
      </View>
    </View>
  );
}

export function SearchBox({ onPress }: { onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Press
      accessibilityRole="search"
      accessibilityLabel="Search"
      onPress={onPress}
      scaleTo={1}
      style={{
        minHeight: 40,
        marginTop: 4,
        marginHorizontal: 16,
        marginBottom: 8,
        paddingHorizontal: 12,
        borderRadius: radius.input,
        backgroundColor: c.s1,
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
      }}
    >
      <Icon name="search" size={18} color="mu" />
      <T color="mu" style={{ flex: 1 }}>
        Search
      </T>
    </Press>
  );
}

export function OfflinePill() {
  const { c } = useTheme();
  return (
    <View
      accessibilityRole="alert"
      style={{
        alignSelf: "center",
        minHeight: 32,
        paddingHorizontal: 14,
        marginVertical: 4,
        borderRadius: 999,
        backgroundColor: c.s1,
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
      }}
    >
      <Icon name="wifiOff" size={15} color="mu" />
      <T size={12.5} weight={500} color="tx2">
        You're offline. Messages send when you're back.
      </T>
    </View>
  );
}

export function PermissionBanner({
  onNotNow,
  onTurnOn,
}: {
  onNotNow: () => void;
  onTurnOn: () => void;
}) {
  const { c } = useTheme();
  return (
    <View
      accessibilityLabel="Turn on notifications"
      style={{
        marginTop: 4,
        marginHorizontal: 16,
        marginBottom: 10,
        padding: 12,
        borderRadius: 16,
        backgroundColor: c.s1,
        gap: 12,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Icon name="bell" size={18} color="mu" />
        <T size={13} style={{ flex: 1 }}>
          Turn on notifications to hear about mentions and replies.
        </T>
      </View>
      <View style={{ flexDirection: "row", gap: 12 }}>
        <PillButton
          label="Not now"
          size="big"
          background="s0"
          style={{ flex: 1, minHeight: 36 }}
          onPress={onNotNow}
        />
        <PillButton
          label="Turn on"
          variant="solid"
          size="big"
          style={{ flex: 1, minHeight: 36 }}
          onPress={onTurnOn}
        />
      </View>
    </View>
  );
}

/** What Groups shows before its first load while the live connection is down. */
export function CantConnectYet({ action }: { action?: ReactNode }) {
  return (
    <CenterState
      icon="wifiOff"
      title="Can't connect"
      text="Your groups will load when you're back online."
      action={action}
    />
  );
}

/** Centered empty or removed state: round badge, 18px heading, muted copy, optional action. */
export function CenterState({
  icon,
  title,
  text,
  action,
}: {
  icon: "users" | "ban" | "mail" | "wifiOff";
  title: string;
  text: string;
  action?: ReactNode;
}) {
  const { c } = useTheme();
  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: 24,
        paddingHorizontal: 32,
        gap: 6,
      }}
    >
      <View
        style={{
          width: 56,
          height: 56,
          borderRadius: 28,
          backgroundColor: c.s1,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon name={icon} size={24} color="mu" />
      </View>
      <T
        size={18}
        weight={600}
        style={{ marginTop: 10, textAlign: "center" }}
        accessibilityRole="header"
      >
        {title}
      </T>
      <T color="mu" style={{ maxWidth: 340, textAlign: "center" }}>
        {text}
      </T>
      {action ? (
        <View
          style={{
            marginTop: 16,
            flexDirection: "row",
            flexWrap: "wrap",
            justifyContent: "center",
            gap: 8,
          }}
        >
          {action}
        </View>
      ) : null}
    </View>
  );
}
