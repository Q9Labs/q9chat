import { useContext, useState } from "react";
import { Image, View } from "react-native";

import { useTheme } from "../theme";
import { T } from "../theme/Text";
import type { Avatar as AvatarData } from "../types";
import { Icon } from "./Icon";
import { ImageAuthContext } from "./photoAuth";
import { Press } from "./Press";

const fontFor: Record<number, number> = {
  22: 9,
  24: 9.5,
  28: 11,
  32: 12,
  36: 12,
  40: 13,
  44: 15,
  48: 16,
  72: 24,
};

/** Round for people and groups alike: a photo, else initials on the person's fixed color. */
export function Avatar({ avatar, size = 32 }: { avatar: AvatarData; size?: number }) {
  if (avatar.kind === "person" && avatar.photoUrl)
    return <PhotoAvatar key={avatar.photoUrl} avatar={avatar} url={avatar.photoUrl} size={size} />;
  return <InitialsAvatar avatar={avatar} size={size} />;
}

const shapeOf = (size: number) => ({
  width: size,
  height: size,
  borderRadius: size / 2,
  overflow: "hidden" as const,
});

/** The protected photo; one that fails to load falls back to the initials. */
function PhotoAvatar({ avatar, url, size }: { avatar: AvatarData; url: string; size: number }) {
  const [failed, setFailed] = useState(false);
  const auth = useContext(ImageAuthContext);
  if (failed) return <InitialsAvatar avatar={avatar} size={size} />;
  return (
    <Image
      source={{
        uri: url,
        ...(auth && url.startsWith(auth.origin) ? { headers: auth.headers } : {}),
      }}
      style={shapeOf(size)}
      accessibilityElementsHidden
      onError={() => setFailed(true)}
    />
  );
}

function InitialsAvatar({ avatar, size }: { avatar: AvatarData; size: number }) {
  const { c } = useTheme();
  const base = shapeOf(size);
  const group = avatar.kind === "group";
  const font = fontFor[size] ?? Math.round(size * 0.375);
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        base,
        {
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: group ? c.s2 : avatar.color,
        },
      ]}
    >
      <T size={font} weight={600} lineHeight={font} capped color={group ? "tx2" : "#ffffff"}>
        {avatar.initials}
      </T>
    </View>
  );
}

/** A 72px avatar with the camera badge that adds or removes the photo. */
export function PhotoPicker({
  avatar,
  hasPhoto,
  onPress,
  size = 72,
}: {
  avatar: AvatarData;
  hasPhoto: boolean;
  onPress: () => void;
  size?: number;
}) {
  const { c } = useTheme();
  return (
    <Press
      accessibilityRole="button"
      accessibilityLabel={hasPhoto ? "Remove photo" : "Add a photo"}
      onPress={onPress}
      scaleTo={1}
    >
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
