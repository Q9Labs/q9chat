import { useSyncExternalStore } from "react";

import { Composer } from "../chat/composer.js";
import { normalizeText, type useTextOutbox } from "./text-outbox.js";

const laterJourney = () => {};

export function TextComposer({
  title,
  store,
  onChange,
  onSend,
  onBlur,
}: {
  readonly title: string;
  readonly store: ReturnType<typeof useTextOutbox>["composer"];
  readonly onChange: (value: string) => void;
  readonly onSend: () => void;
  readonly onBlur: () => void;
}) {
  const value = useSyncExternalStore(store.subscribe, store.getDraft, store.getDraft);
  const body = normalizeText(value);
  return (
    <Composer
      title={title}
      value={value}
      onChange={onChange}
      onSend={onSend}
      onBlur={onBlur}
      sendDisabled={!body.trim() || body.length > 4000}
      textOnly
      mode={null}
      onCancelMode={laterJourney}
      onEditLast={laterJourney}
      attachOpen={false}
      onAttachOpenChange={laterJourney}
      onPickAttachment={laterJourney}
      onRecord={laterJourney}
      recording={null}
      onCancelRecording={laterJourney}
      onSendRecording={laterJourney}
    />
  );
}
