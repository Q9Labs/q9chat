import { Image, View } from "react-native";
import { Icon } from "./Icon";
import { Press } from "./Press";
import { useTheme } from "../theme";
import { T } from "../theme/Text";
import type { Avatar as AvatarData } from "../types";

const fontFor: Record<number, number> = { 22: 9, 24: 9.5, 28: 11, 32: 12, 36: 12, 40: 13, 44: 15, 48: 16, 72: 24 };

/** Round for people and groups alike: a photo, else initials on the person's fixed color. */
export function Avatar({ avatar, size = 32 }: { avatar: AvatarData; size?: number }) {
  const { c } = useTheme();
  const base = { width: size, height: size, borderRadius: size / 2, overflow: "hidden" as const };
  if (avatar.kind === "person" && avatar.photoUrl) {
    return <Image source={{ uri: avatar.photoUrl }} style={base} accessibilityElementsHidden />;
  }
  const group = avatar.kind === "group";
  const font = fontFor[size] ?? Math.round(size * 0.375);
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[base, { alignItems: "center", justifyContent: "center", backgroundColor: group ? c.s2 : avatar.color }]}
    >
      <T size={font} weight={600} lineHeight={font} color={group ? "tx2" : "#ffffff"}>
        {avatar.initials}
      </T>
    </View>
  );
}

/** A 72px avatar with the camera badge that adds or removes the photo. */
export function PhotoPicker({ avatar, hasPhoto, onPress, size = 72 }: { avatar: AvatarData; hasPhoto: boolean; onPress: () => void; size?: number }) {
  const { c } = useTheme();
  return (
    <Press accessibilityRole="button" accessibilityLabel={hasPhoto ? "Remove photo" : "Add a photo"} onPress={onPress} scaleTo={1}>
      <Avatar avatar={avatar} size={size} />
      <View
        style={{
          position: "absolute",
          bottom: -2,
          end: -2,
          width: 28,
          height: 28,
          borderRadius: 14,
          backgroundColor: c.tx,
          borderWidth: 3,
          borderColor: c.pop,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon name="camera" size={13} color="s0" />
      </View>
    </Press>
  );
}
