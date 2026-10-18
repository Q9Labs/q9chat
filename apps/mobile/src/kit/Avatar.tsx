import { useContext, useState } from "react";
import { Image, StyleSheet, View } from "react-native";

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

/**
 * Round for people and groups alike: the initials on the person's fixed color are always drawn, and a photo
 * is laid over them, so a photo that is loading, fails or has transparent pixels never leaves a blank circle.
 * `testID` is "avatar-photo" while the photo shows and "avatar-initials" otherwise.
 */
export function Avatar({ avatar, size = 32 }: { avatar: AvatarData; size?: number }) {
  if (avatar.kind === "person" && avatar.photoUrl)
    return <PersonAvatar key={avatar.photoUrl} avatar={avatar} url={avatar.photoUrl} size={size} />;
  return (
    <View testID="avatar-initials" style={shapeOf(size)}>
      <Initials avatar={avatar} size={size} />
    </View>
  );
}

const shapeOf = (size: number) => ({
  width: size,
  height: size,
  borderRadius: size / 2,
  overflow: "hidden" as const,
});

/** A person with a protected photo: the initials and color stay underneath for good, so a transparent photo keeps its base. */
function PersonAvatar({ avatar, url, size }: { avatar: AvatarData; url: string; size: number }) {
  const [loaded, setLoaded] = useState(false);
  // A failed photo is remembered with the token and connection it failed under, so it is tried again
  // once when either changes, and never in a loop.
  const [failedUnder, setFailedUnder] = useState<string | null>(null);
  const auth = useContext(ImageAuthContext);
  const protectedPhoto = auth !== undefined && url.startsWith(auth.origin);
  const attempt = protectedPhoto ? `${auth.headers.Authorization}|${auth.connected}` : "open";
  return (
    <View testID={loaded ? "avatar-photo" : "avatar-initials"} style={shapeOf(size)}>
      <Initials avatar={avatar} size={size} />
      {failedUnder === attempt ? null : (
        <Image
          source={{ uri: url, ...(protectedPhoto ? { headers: auth.headers } : {}) }}
          style={StyleSheet.absoluteFill}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          onLoad={() => setLoaded(true)}
          onError={() => setFailedUnder(attempt)}
        />
      )}
    </View>
  );
}

function Initials({ avatar, size }: { avatar: AvatarData; size: number }) {
  const { c } = useTheme();
  const group = avatar.kind === "group";
  const font = fontFor[size] ?? Math.round(size * 0.375);
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        StyleSheet.absoluteFill,
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
