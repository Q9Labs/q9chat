import { Link, Redirect } from "expo-router";
import { ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { STATES } from "../../src/gallery/states";
import { useTheme } from "../../src/theme";
import { T } from "../../src/theme/Text";

/** Dev-only index of every screen and state; the production bundle leaves this route out. */
export default function GalleryIndex() {
  const { c } = useTheme();
  if (!__DEV__) return <Redirect href="/" />;
  const groups = [...new Set(STATES.map((state) => state.group))];
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.s0 }}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
        <T size={22} weight={600}>
          Gallery
        </T>
        {groups.map((group) => (
          <View key={group} style={{ gap: 6 }}>
            <T size={13} weight={600} color="mu">
              {group}
            </T>
            {STATES.filter((state) => state.group === group).map((state) => (
              <Link key={state.id} href={{ pathname: "/gallery/[state]", params: { state: state.id } }}>
                <T size={15}>{`${state.title}  ·  ${state.id}`}</T>
              </Link>
            ))}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
