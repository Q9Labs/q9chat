import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Animated,
  BackHandler,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { RaisedSurface, useTheme } from "../theme";
import { T } from "../theme/Text";
import { motion, radius } from "../theme/tokens";
import { PillButton } from "./Buttons";
import { Icon, type IconName } from "./Icon";
import { moveEasing, useEased, useReducedMotion } from "./motion";
import { Press } from "./Press";

/**
 * Bottom sheet: runs to the bottom edge, only the top corners are rounded, and its content stays
 * above the home indicator. Render it inside the screen's root view so it covers that screen.
 */
export function Sheet({
  onDismiss,
  children,
  label,
}: {
  onDismiss: () => void;
  children: ReactNode;
  label: string;
}) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const { height: screenHeight } = useWindowDimensions();
  const reduced = useReducedMotion();
  const [y] = useState(() => new Animated.Value(screenHeight));
  const [measured, setMeasured] = useState(false);
  const scrim = useEased(1, motion.scrim, 0);

  // Android Back closes the sheet and stops there; the next Back reaches the screen under it.
  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      onDismiss();
      return true;
    });
    return () => subscription.remove();
  }, [onDismiss]);

  // The sheet is anchored to the screen bottom, so an open keyboard would cover its actions.
  useEffect(() => {
    Keyboard.dismiss();
  }, []);

  useEffect(() => {
    if (!measured) return;
    if (reduced) {
      y.setValue(0);
      return;
    }
    Animated.timing(y, {
      toValue: 0,
      duration: motion.sheet,
      easing: moveEasing,
      useNativeDriver: true,
    }).start();
  }, [measured, reduced, y]);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View
        style={[StyleSheet.absoluteFill, { backgroundColor: c.scrim, opacity: scrim }]}
      >
        <Pressable
          accessibilityLabel="Close"
          accessibilityRole="button"
          onPress={onDismiss}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
      <RaisedSurface>
        <SheetPanel
          label={label}
          onDismiss={onDismiss}
          y={y}
          onMeasured={() => setMeasured(true)}
          bottomInset={insets.bottom}
        >
          {children}
        </SheetPanel>
      </RaisedSurface>
    </View>
  );
}

function SheetPanel({
  children,
  y,
  onMeasured,
  bottomInset,
  label,
  onDismiss,
}: {
  children: ReactNode;
  y: Animated.Value;
  onMeasured: () => void;
  bottomInset: number;
  label: string;
  onDismiss: () => void;
}) {
  const { c } = useTheme();
  const { height } = useWindowDimensions();
  const first = useRef(true);
  return (
    <Animated.View
      accessibilityViewIsModal
      accessibilityLabel={label}
      // VoiceOver ignores the backdrop's Close button while the panel is modal; the two-finger scrub closes it.
      onAccessibilityEscape={onDismiss}
      onLayout={(event) => {
        if (!first.current) return;
        first.current = false;
        y.setValue(event.nativeEvent.layout.height);
        onMeasured();
      }}
      style={{
        position: "absolute",
        start: 0,
        end: 0,
        bottom: 0,
        maxHeight: height * 0.88,
        backgroundColor: c.pop,
        borderTopLeftRadius: radius.sheet,
        borderTopRightRadius: radius.sheet,
        transform: [{ translateY: y }],
      }}
    >
      <ScrollView
        bounces={false}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: 8,
          paddingHorizontal: 16,
        }}
      >
        <View
          style={{
            width: 36,
            height: 5,
            borderRadius: 3,
            backgroundColor: c.ln2,
            alignSelf: "center",
            marginBottom: 14,
          }}
        />
        {children}
        <View style={{ height: 8 + bottomInset }} />
      </ScrollView>
    </Animated.View>
  );
}

export function SheetTitle({ children }: { children: string }) {
  return (
    <T
      size={17}
      weight={600}
      lineHeight={23.8}
      style={{ marginBottom: 6 }}
      accessibilityRole="header"
    >
      {children}
    </T>
  );
}

function SheetText({ children }: { children: string }) {
  return (
    <T color="mu" style={{ marginBottom: 20 }}>
      {children}
    </T>
  );
}

/** Confirmation: primary action on top, Cancel under it, both 48px. */
export function ConfirmSheet({
  title,
  text,
  confirmLabel,
  cancelLabel = "Cancel",
  danger = true,
  confirmDisabled,
  onConfirm,
  onCancel,
  children,
}: {
  title: string;
  text: string;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  confirmDisabled?: boolean | undefined;
  onConfirm: () => void;
  onCancel: () => void;
  children?: ReactNode;
}) {
  return (
    <Sheet label={title} onDismiss={onCancel}>
      <SheetTitle>{title}</SheetTitle>
      <SheetText>{text}</SheetText>
      {children}
      <View style={{ marginTop: children ? 20 : 0, gap: 8 }}>
        <PillButton
          label={confirmLabel}
          size="sheet"
          variant={danger ? "solidDanger" : "solid"}
          disabled={confirmDisabled}
          onPress={onConfirm}
        />
        <PillButton label={cancelLabel} size="sheet" onPress={onCancel} />
      </View>
    </Sheet>
  );
}

/** Full-bleed sheet row: 52px, 16px type, hairline between rows. */
export function SheetRow({
  icon,
  label,
  onPress,
  danger,
  first,
}: {
  icon?: IconName;
  label: string;
  onPress: () => void;
  danger?: boolean;
  first?: boolean;
}) {
  const { c } = useTheme();
  return (
    <Press
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      scaleTo={1}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
        minHeight: 52,
        paddingHorizontal: 20,
        marginHorizontal: -16,
        borderTopWidth: first ? 0 : 1,
        borderTopColor: c.ln,
      }}
    >
      {icon ? <Icon name={icon} size={20} color={danger ? "er" : "mu"} /> : null}
      <T size={16} color={danger ? "er" : "tx"}>
        {label}
      </T>
    </Press>
  );
}

/** A toast line, with an optional action such as "Try again". */
export type ToastNotice = { text: string; action?: { label: string; onPress: () => void } };

/** A transient status: slides up 8px and fades in over 200ms. */
export function Toast({ text, action }: ToastNotice) {
  const { c } = useTheme();
  const progress = useEased(1, motion.toast, 0);
  return (
    <View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        start: 0,
        end: 0,
        bottom: 110,
        alignItems: "center",
        zIndex: 70,
      }}
    >
      <Animated.View
        accessibilityRole="alert"
        style={{
          minHeight: 44,
          paddingStart: 12,
          paddingEnd: 16,
          borderRadius: radius.menu,
          backgroundColor: c.pop,
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          boxShadow: c.shadow,
          opacity: progress,
          transform: [
            { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) },
          ],
        }}
      >
        <Icon name="check" size={18} color="mu" />
        <T size={14} style={{ flexShrink: 1 }}>
          {text}
        </T>
        {action ? (
          <Press
            accessibilityRole="button"
            onPress={action.onPress}
            scaleTo={1}
            hitSlop={8}
            style={{ minWidth: 44, minHeight: 44, justifyContent: "center" }}
          >
            <T size={14} weight={600} color="ac">
              {action.label}
            </T>
          </Press>
        ) : null}
      </Animated.View>
    </View>
  );
}
