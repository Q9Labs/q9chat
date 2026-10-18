import { ScrollView, TextInput, View } from "react-native";
import { Avatar } from "../kit/Avatar";
import { Screen } from "../kit/Chrome";
import { Icon } from "../kit/Icon";
import { Press } from "../kit/Press";
import { useTheme } from "../theme";
import { T } from "../theme/Text";
import { fonts, radius } from "../theme/tokens";
import type { SearchHit } from "../types";

export type SearchScreenProps = {
  query: string;
  onQueryChange: (query: string) => void;
  /** The group title when searching inside one group. */
  scopeTitle: string | null;
  onClearScope: () => void;
  hits: readonly SearchHit[];
  onOpenHit: (hit: SearchHit) => void;
  onCancel: () => void;
};

const SCOPE_LIMIT = 22;

function ScopeChip({ title, onClear }: { title: string; onClear: () => void }) {
  const { c } = useTheme();
  const shown = title.length > SCOPE_LIMIT ? `${title.slice(0, SCOPE_LIMIT - 1)}…` : title;
  return (
    <View style={{ height: 28, paddingLeft: 10, paddingRight: 2, borderRadius: 999, backgroundColor: c.s0, flexDirection: "row", alignItems: "center", gap: 2 }}>
      <T size={12} weight={600} color="tx2">{`In ${shown}`}</T>
      <Press accessibilityRole="button" accessibilityLabel="Search all groups" onPress={onClear} scaleTo={0.92} style={{ width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center" }}>
        <Icon name="x" size={12} color="mu" />
      </Press>
    </View>
  );
}

function Hit({ hit, onPress }: { hit: SearchHit; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Press
      accessibilityRole="button"
      accessibilityLabel={`${hit.groupTitle}, ${hit.author}: ${hit.before}${hit.match}${hit.after}`}
      onPress={onPress}
      scaleTo={1}
      style={{ flexDirection: "row", alignItems: "flex-start", gap: 12, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12 }}
    >
      <View style={{ width: 32 }}>
        <Avatar avatar={hit.groupAvatar} size={28} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}>
          <T size={13} weight={600} numberOfLines={1} style={{ flexShrink: 1 }}>
            {hit.groupTitle}
          </T>
          <T size={12} color="mu">{`· ${hit.author}`}</T>
          <T size={12} color="mu" tabular style={{ marginStart: "auto" }}>
            {hit.whenLabel}
          </T>
        </View>
        <T color="tx2" numberOfLines={2}>
          {hit.before}
          <T weight={600} style={{ backgroundColor: c.s2 }}>
            {hit.match}
          </T>
          {hit.after}
        </T>
      </View>
    </Press>
  );
}

/** Full-screen search: a field with Cancel, then results newest first. */
export function SearchScreen(props: SearchScreenProps) {
  const { c } = useTheme();
  const query = props.query.trim();
  return (
    <Screen safeBottom>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16 }}>
        <View
          style={{
            flex: 1,
            height: 44,
            marginVertical: 4,
            paddingLeft: 14,
            paddingRight: 6,
            borderRadius: radius.input,
            backgroundColor: c.s1,
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
          }}
        >
          <Icon name="search" size={18} color="mu" />
          <TextInput
            accessibilityLabel="Search messages"
            autoFocus={false}
            value={props.query}
            onChangeText={props.onQueryChange}
            placeholder="Search messages"
            placeholderTextColor={c.mu}
            selectionColor={c.ac}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            style={{ flex: 1, height: "100%", padding: 0, fontFamily: fonts[400], fontSize: 15, color: c.tx }}
          />
          {props.scopeTitle ? <ScopeChip title={props.scopeTitle} onClear={props.onClearScope} /> : null}
        </View>
        <Press accessibilityRole="button" accessibilityLabel="Cancel" onPress={props.onCancel} scaleTo={1} style={{ height: 44, justifyContent: "center" }}>
          <T size={16}>Cancel</T>
        </Press>
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 6, paddingBottom: 6 }}>
        {!query ? (
          <T color="mu" style={{ paddingVertical: 36, paddingHorizontal: 20, textAlign: "center" }}>
            {props.scopeTitle ? `Search messages in ${props.scopeTitle}.` : "Search messages in all your groups."}
          </T>
        ) : props.hits.length === 0 ? (
          <T color="mu" style={{ paddingVertical: 36, paddingHorizontal: 20, textAlign: "center" }}>{`No messages match “${query}”.`}</T>
        ) : (
          <>
            <T size={12} weight={600} color="mu" style={{ paddingTop: 4, paddingHorizontal: 12, paddingBottom: 6 }}>
              {`${props.hits.length} ${props.hits.length === 1 ? "message" : "messages"}`}
            </T>
            {props.hits.map((hit) => (
              <Hit key={`${hit.groupId}:${hit.sequence}`} hit={hit} onPress={() => props.onOpenHit(hit)} />
            ))}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}
