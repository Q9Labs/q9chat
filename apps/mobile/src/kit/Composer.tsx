import { useEffect, useState, type ReactNode } from "react";
import { Animated, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTheme } from "../theme";
import { T } from "../theme/Text";
import { fonts } from "../theme/tokens";
import { IconButton, PillButton } from "./Buttons";
import { formatDuration, truncate } from "./format";
import { Icon, type IconName } from "./Icon";
import { Waveform } from "./MessageParts";
import { useReducedMotion } from "./motion";
import { Press } from "./Press";

export type ComposerMode =
  | { kind: "compose" }
  | { kind: "reply"; author: string; summary: string }
  | { kind: "edit" }
  | { kind: "recording"; seconds: number; levels: readonly number[] }
  | { kind: "readonly" };

type Props = {
  mode: ComposerMode;
  draft: string;
  onDraftChange: (text: string) => void;
  onBlur?: () => void;
  groupTitle: string;
  onSend: () => void;
  onAttach: () => void;
  onRecord: () => void;
  onCancelMode: () => void;
  onRecordCancel: () => void;
  onRecordSend: () => void;
};

const SHRINK_AT = 28;

function Blink({ children }: { children: (opacity: Animated.Value) => ReactNode }) {
  const reduced = useReducedMotion();
  const [opacity] = useState(() => new Animated.Value(1));
  useEffect(() => {
    const loop = reduced
      ? null
      : Animated.loop(
          Animated.sequence([
            Animated.timing(opacity, { toValue: 0.25, duration: 480, useNativeDriver: true }),
            Animated.timing(opacity, { toValue: 1, duration: 480, useNativeDriver: true }),
            Animated.delay(240),
          ]),
        );
    loop?.start();
    return () => loop?.stop();
  }, [opacity, reduced]);
  return <>{children(opacity)}</>;
}

function Bar({
  icon,
  label,
  onClose,
  closeLabel,
}: {
  icon: IconName;
  label: ReactNode;
  onClose: () => void;
  closeLabel: string;
}) {
  const { c } = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        marginHorizontal: 8,
        marginBottom: 8,
        paddingStart: 10,
        borderStartWidth: 2,
        borderStartColor: c.ac,
        minHeight: 32,
      }}
    >
      <Icon name={icon} size={16} color="mu" />
      <T size={13} color="mu" numberOfLines={1} style={{ flex: 1 }}>
        {label}
      </T>
      <IconButton icon="x" iconSize={16} size={32} label={closeLabel} onPress={onClose} />
    </View>
  );
}

function Shell({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{ paddingTop: 6, paddingHorizontal: 10, paddingBottom: Math.max(insets.bottom, 6) }}
    >
      {children}
    </View>
  );
}

function ReadonlyPill() {
  const { c } = useTheme();
  return (
    <View
      style={{
        minHeight: 44,
        paddingHorizontal: 16,
        borderRadius: 22,
        backgroundColor: c.s1,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
      }}
    >
      <Icon name="lock" size={16} color="mu" />
      <T size={13} color="mu" style={{ flexShrink: 1 }}>
        You can't send messages here because you're no longer a member.
      </T>
    </View>
  );
}

function RecordingPill({
  mode,
  onCancel,
  onSend,
}: {
  mode: Extract<ComposerMode, { kind: "recording" }>;
  onCancel: () => void;
  onSend: () => void;
}) {
  const { c } = useTheme();
  return (
    <View
      accessibilityLiveRegion="polite"
      style={{
        minHeight: 44,
        paddingVertical: 3,
        paddingEnd: 3,
        paddingStart: 16,
        borderRadius: 22,
        backgroundColor: c.s1,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
      }}
    >
      <Blink>
        {(opacity) => (
          <Animated.View
            style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.er2, opacity }}
          />
        )}
      </Blink>
      <T>Recording</T>
      <T size={12} color="mu" tabular style={{ minWidth: 30, textAlign: "right" }}>
        {formatDuration(mode.seconds)}
      </T>
      <Waveform samples={mode.levels} progress={1} height={22} />
      <PillButton label="Cancel" background="s0" onPress={onCancel} />
      <SendButton label="Send voice note" onPress={onSend} />
    </View>
  );
}

function ModeBar({ mode, onClose }: { mode: ComposerMode; onClose: () => void }) {
  if (mode.kind === "reply") {
    return (
      <Bar
        icon="reply"
        closeLabel="Cancel reply"
        onClose={onClose}
        label={
          <>
            {"Replying to "}
            <T size={13} weight={600} color="tx2">
              {mode.author}
            </T>
            {` · ${mode.summary}`}
          </>
        }
      />
    );
  }
  if (mode.kind !== "edit") return null;
  return (
    <Bar
      icon="pencil"
      closeLabel="Cancel editing"
      onClose={onClose}
      label={
        <T size={13} weight={600} color="tx2">
          Editing message
        </T>
      }
    />
  );
}

const shortTitle = (title: string) => truncate(title, SHRINK_AT);

function TrailingButton({
  editing,
  hasText,
  onRecord,
  onSend,
}: {
  editing: boolean;
  hasText: boolean;
  onRecord: () => void;
  onSend: () => void;
}) {
  if (editing || hasText) {
    return (
      <SendButton
        label={editing ? "Save edit" : "Send"}
        icon={editing ? "check" : "up"}
        disabled={!hasText}
        onPress={onSend}
      />
    );
  }
  return (
    <IconButton icon="mic" iconSize={20} size={36} label="Record a voice note" onPress={onRecord} />
  );
}

function ComposeRow({ props, editing }: { props: Props; editing: boolean }) {
  const { c } = useTheme();
  const { draft } = props;
  const [focused, setFocused] = useState(false);
  const [inputHeight, setInputHeight] = useState(36);
  const hasText = draft.trim().length > 0;
  return (
    <View
      style={{
        minHeight: 44,
        padding: 3,
        borderRadius: 22,
        backgroundColor: c.s1,
        borderWidth: 1,
        borderColor: focused || editing ? c.tx : "transparent",
        flexDirection: "row",
        alignItems: "flex-end",
        gap: 2,
      }}
    >
      {editing ? null : (
        <IconButton
          icon="clip"
          iconSize={20}
          size={36}
          label="Attach a photo or file"
          onPress={props.onAttach}
        />
      )}
      <TextInput
        accessibilityLabel={`Message ${props.groupTitle}`}
        multiline
        value={draft}
        onChangeText={props.onDraftChange}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          props.onBlur?.();
        }}
        onContentSizeChange={(event) =>
          setInputHeight(Math.min(140, Math.max(36, event.nativeEvent.contentSize.height)))
        }
        placeholder={`Message ${shortTitle(props.groupTitle)}`}
        placeholderTextColor={c.mu}
        selectionColor={c.ac}
        style={{
          flex: 1,
          height: inputHeight,
          paddingHorizontal: 6,
          paddingTop: 8,
          paddingBottom: 8,
          fontFamily: fonts[400],
          fontSize: 15,
          lineHeight: 20,
          color: c.tx,
        }}
      />
      <TrailingButton
        editing={editing}
        hasText={hasText}
        onRecord={props.onRecord}
        onSend={props.onSend}
      />
    </View>
  );
}

/** The composer pill: 44px, grows with its text. Mic until there is text, then send. */
export function Composer(props: Props) {
  const { mode } = props;
  if (mode.kind === "readonly") {
    return (
      <Shell>
        <ReadonlyPill />
      </Shell>
    );
  }
  if (mode.kind === "recording") {
    return (
      <Shell>
        <RecordingPill mode={mode} onCancel={props.onRecordCancel} onSend={props.onRecordSend} />
      </Shell>
    );
  }
  return (
    <Shell>
      <ModeBar mode={mode} onClose={props.onCancelMode} />
      <ComposeRow props={props} editing={mode.kind === "edit"} />
    </Shell>
  );
}

function SendButton({
  label,
  icon = "up",
  disabled = false,
  onPress,
}: {
  label: string;
  icon?: IconName;
  disabled?: boolean;
  onPress: () => void;
}) {
  const { c } = useTheme();
  return (
    <Press
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={4}
      onPress={onPress}
      scaleTo={0.92}
      style={{
        width: 36,
        height: 36,
        borderRadius: 18,
        opacity: disabled ? 0.4 : 1,
        backgroundColor: c.ac,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Icon name={icon} size={18} color="onAc" strokeWidth={2.2} />
    </Press>
  );
}
