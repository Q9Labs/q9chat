import { ScrollView, View } from "react-native";

import { PhotoPicker } from "../kit/Avatar";
import { PillButton } from "../kit/Buttons";
import { PageNav, Screen } from "../kit/Chrome";
import { Field, FlatValue, Note, TextField } from "../kit/Field";
import { AppleGlyph, GoogleGlyph, Icon } from "../kit/Icon";
import { ConfirmSheet, Toast } from "../kit/Overlays";
import { T } from "../theme/Text";
import type { Me } from "../types";

export type AccountScreenProps = {
  me: Me;
  name: string;
  onNameChange: (name: string) => void;
  /** A name save is out: the field is locked until it ends. */
  nameSaving: boolean;
  /** Set when leaving could not save the name; asks whether to keep editing or discard. */
  unsaved: {
    text: string;
    title: string;
    confirmLabel: string;
    cancelLabel: string;
    onKeepEditing: () => void;
    onDiscard: () => void;
  } | null;
  hasPhoto: boolean;
  onTogglePhoto: () => void;
  confirmDelete: boolean;
  deleting?: boolean;
  toast: string | null;
  onBack: () => void;
  onSignOut: () => void;
  /** Sign out is under way; the button says so and does nothing more. */
  signingOut: boolean;
  onAskDelete: () => void;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
};

function ProviderIcon({ provider }: { provider: Me["signedInWith"] }) {
  if (provider === "Google") return <GoogleGlyph />;
  if (provider === "Apple") return <AppleGlyph />;
  return <Icon name="mail" size={20} color="tx" />;
}

/** The name field, locked with a "Saving…" mark while the save is out. */
function NameField({
  value,
  onChange,
  saving,
}: {
  value: string;
  onChange: (name: string) => void;
  saving: boolean;
}) {
  return (
    <Field label="Name">
      <TextField
        accessibilityLabel="Name"
        value={value}
        onChangeText={onChange}
        editable={!saving}
        right={
          saving ? (
            <T size={12} color="mu">
              Saving…
            </T>
          ) : undefined
        }
        autoCorrect={false}
      />
    </Field>
  );
}

export function AccountScreen(props: AccountScreenProps) {
  const { person, signedInWith } = props.me;
  return (
    <Screen safeBottom>
      <PageNav title="Account" start={{ back: true, onPress: props.onBack }} />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 18 }}
      >
        <View
          style={{
            alignItems: "center",
            gap: 2,
            paddingTop: 18,
            paddingHorizontal: 20,
            paddingBottom: 16,
          }}
        >
          <PhotoPicker
            avatar={person.avatar}
            hasPhoto={props.hasPhoto}
            onPress={props.onTogglePhoto}
          />
          <T
            size={17}
            weight={600}
            style={{ marginTop: 10, textAlign: "center" }}
            accessibilityRole="header"
          >
            {person.fullName}
          </T>
          <T size={13} color="mu">
            {person.email}
          </T>
        </View>
        <NameField value={props.name} onChange={props.onNameChange} saving={props.nameSaving} />
        <Field label="Photo">
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              flexWrap: "wrap",
              columnGap: 12,
              rowGap: 10,
            }}
          >
            <PillButton
              label={props.hasPhoto ? "Remove photo" : "Upload photo"}
              onPress={props.onTogglePhoto}
            />
            <Note style={{ margin: 0, flexShrink: 1, lineHeight: 14.4 }}>
              {props.hasPhoto
                ? "People see your photo."
                : "Without a photo, people see your initials on your color."}
            </Note>
          </View>
        </Field>
        <Field label="Signed in with">
          <FlatValue
            icon={<ProviderIcon provider={signedInWith} />}
            text={`${signedInWith} · ${person.email}`}
          />
        </Field>
        <View
          style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 8, gap: 8 }}
        >
          <PillButton
            label="Delete account"
            icon="trash"
            variant="danger"
            onPress={props.onAskDelete}
          />
          <PillButton
            label={props.signingOut ? "Signing out…" : "Sign out"}
            icon="logout"
            disabled={props.signingOut}
            onPress={props.onSignOut}
          />
        </View>
      </ScrollView>
      <DeleteAccountSheet {...props} />
      {props.unsaved ? (
        <ConfirmSheet
          title={props.unsaved.title}
          text={props.unsaved.text}
          confirmLabel={props.unsaved.confirmLabel}
          cancelLabel={props.unsaved.cancelLabel}
          onConfirm={props.unsaved.onDiscard}
          onCancel={props.unsaved.onKeepEditing}
        />
      ) : null}
      {props.toast ? <Toast text={props.toast} /> : null}
    </Screen>
  );
}

function DeleteAccountSheet(props: AccountScreenProps) {
  if (!props.confirmDelete) return null;
  return (
    <ConfirmSheet
      title="Delete your account?"
      text="You leave every group. Your messages stay so conversations still make sense, and show “Deleted account” as the sender. This can't be undone."
      confirmLabel={props.deleting ? "Deleting…" : "Delete account"}
      confirmDisabled={props.deleting ?? false}
      onConfirm={props.onConfirmDelete}
      onCancel={props.onCancelDelete}
    />
  );
}
