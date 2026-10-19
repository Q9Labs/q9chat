import { ActivityIndicator, View } from "react-native";

import { useTheme } from "../theme";

export function Loading() {
  const { c } = useTheme();
  return (
    <View
      accessibilityLabel="Loading"
      style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: c.s0 }}
    >
      <ActivityIndicator color={c.mu} />
    </View>
  );
}
