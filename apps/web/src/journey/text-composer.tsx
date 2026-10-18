import { Composer } from "../chat/composer.js";

const laterJourney = () => {};

export function TextComposer({
  title,
  value,
  onChange,
  onSend,
  onBlur,
}: {
  readonly title: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly onSend: () => void;
  readonly onBlur: () => void;
}) {
  return (
    <Composer
      title={title}
      value={value}
      onChange={onChange}
      onSend={onSend}
      onBlur={onBlur}
      sendDisabled={!value.trim() || value.length > 4000}
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
