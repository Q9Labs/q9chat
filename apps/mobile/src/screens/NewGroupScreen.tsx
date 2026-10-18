import { useState } from "react";
import { ScrollView, TextInput, View } from "react-native";
import { Avatar } from "../kit/Avatar";
import { PageNav, Screen } from "../kit/Chrome";
import { Field, LinkBox, Note, TextField } from "../kit/Field";
import { Icon } from "../kit/Icon";
import { Press } from "../kit/Press";
import { useTheme } from "../theme";
import { T } from "../theme/Text";
import { fonts, radius } from "../theme/tokens";
import type { Person } from "../types";

export type PeopleHint = { kind: "explain" } | { kind: "noAccount"; email: string } | null;

export type NewGroupScreenProps = {
  mode: "create" | "add";
  groupName: string;
  onGroupNameChange: (name: string) => void;
  people: readonly Person[];
  query: string;
  onQueryChange: (query: string) => void;
  suggestions: readonly Person[];
  hint: PeopleHint;
  onPick: (personId: string) => void;
  onUnpick: (personId: string) => void;
  inviteLink: string;
  copied: boolean;
  onCopyLink: () => void;
  /** "Create", "Start", "Open" or "Add". */
  primaryLabel: string;
  primaryEnabled: boolean;
  onPrimary: () => void;
  onCancel: () => void;
};

function PersonChip({ person, onRemove }: { person: Person; onRemove: () => void }) {
  const { c } = useTheme();
  return (
    <View style={{ height: 30, paddingLeft: 3, paddingRight: 2, borderRadius: 999, backgroundColor: c.s0, flexDirection: "row", alignItems: "center", gap: 6 }}>
      <Avatar avatar={person.avatar} size={24} />
      <T size={13} weight={600}>
        {person.name}
      </T>
      <Press accessibilityRole="button" accessibilityLabel={`Remove ${person.name}`} onPress={onRemove} scaleTo={0.92} style={{ width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center" }}>
        <Icon name="x" size={12} color="mu" />
      </Press>
    </View>
  );
}

/** Create or add people: name, people chips with suggestions, and the invite link. */
export function NewGroupScreen(props: NewGroupScreenProps) {
  const { c } = useTheme();
  const add = props.mode === "add";
  const [focused, setFocused] = useState(false);
  return (
    <Screen safeBottom>
      <PageNav
        title={add ? "Add people" : "New group"}
        start={{ label: "Cancel", onPress: props.onCancel }}
        end={{ label: props.primaryLabel, strong: true, disabled: !props.primaryEnabled, onPress: props.onPrimary }}
      />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16 }}>
        {add ? null : (
          <Field label="Group name">
            <TextField accessibilityLabel="Group name" placeholder="Name this group" value={props.groupName} onChangeText={props.onGroupNameChange} autoCorrect={false} />
          </Field>
        )}
        <Field label="Add people">
          <View
            style={{
              minHeight: 44,
              padding: 6,
              borderRadius: radius.input,
              backgroundColor: c.s1,
              borderWidth: 1,
              borderColor: focused ? c.tx : "transparent",
              flexDirection: "row",
              flexWrap: "wrap",
              alignItems: "center",
              gap: 6,
            }}
          >
            {props.people.map((person) => (
              <PersonChip key={person.id} person={person} onRemove={() => props.onUnpick(person.id)} />
            ))}
            <TextInput
              accessibilityLabel="Add people"
              value={props.query}
              onChangeText={props.onQueryChange}
              placeholder={props.people.length ? "Add another" : "Name or email"}
              placeholderTextColor={c.mu}
              selectionColor={c.ac}
              autoCapitalize="none"
              autoCorrect={false}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              style={{ flex: 1, minWidth: 120, height: 30, paddingVertical: 0, paddingHorizontal: 8, fontFamily: fonts[400], fontSize: 15, color: c.tx }}
            />
          </View>
          {props.suggestions.length ? (
            <View accessibilityLabel="People" style={{ marginTop: 6 }}>
              {props.suggestions.map((person) => (
                <Press
                  key={person.id}
                  accessibilityRole="button"
                  accessibilityLabel={`${person.name}, ${person.email}`}
                  onPress={() => props.onPick(person.id)}
                  scaleTo={1}
                  style={{ minHeight: 48, paddingVertical: 6, paddingHorizontal: 8, borderRadius: 12, flexDirection: "row", alignItems: "center", gap: 10 }}
                >
                  <Avatar avatar={person.avatar} size={28} />
                  <View>
                    <T weight={600}>{person.name}</T>
                    <T size={12} color="mu">
                      {person.email}
                    </T>
                  </View>
                </Press>
              ))}
            </View>
          ) : null}
          {props.hint ? (
            <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, marginTop: 8, marginHorizontal: 2 }}>
              <View style={{ marginTop: 1 }}>
                <Icon name={props.hint.kind === "noAccount" ? "alert" : "info"} size={16} color="mu" />
              </View>
              <T size={12.5} color="mu" lineHeight={17.5} style={{ flex: 1 }}>
                {props.hint.kind === "noAccount" ? (
                  <>
                    <T size={12.5} weight={600} color="tx2" lineHeight={17.5}>
                      {props.hint.email}
                    </T>
                    {" doesn't have an account yet. Share the invite link, and they join once they sign up."}
                  </>
                ) : (
                  "People with an account can be added by name or email. For anyone else, share the invite link."
                )}
              </T>
            </View>
          ) : null}
        </Field>
        <Field label="Invite link">
          <LinkBox link={props.inviteLink} copied={props.copied} onCopy={props.onCopyLink} />
          <Note style={{ marginTop: 0 }}>{add ? "Anyone with the link can join and read the whole group." : "Anyone with the link can join once the group exists."}</Note>
        </Field>
      </ScrollView>
    </Screen>
  );
}
