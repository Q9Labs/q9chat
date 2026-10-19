import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { Composer } from "../chat/composer.js";
import { selectedMedia } from "./media-selection.js";
import type { Media } from "./media-storage.js";
import { normalizeText, type useTextOutbox } from "./text-outbox.js";
import { useVoiceRecorder } from "./voice-recorder.js";

const laterJourney = () => {};

export function TextComposer({
  title,
  store,
  onChange,
  onSend,
  onBlur,
  onMedia,
  onError,
}: {
  readonly onMedia: (media: readonly Media[]) => void;
  readonly onError: (error: string) => void;
  readonly title: string;
  readonly store: ReturnType<typeof useTextOutbox>["composer"];
  readonly onChange: (value: string) => void;
  readonly onSend: () => void;
  readonly onBlur: () => void;
}) {
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const [attachOpen, setAttachOpen] = useState(false);
  const photo = useRef<HTMLInputElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const microphone = useRef<HTMLButtonElement | null>(null);
  const recorder = useVoiceRecorder(onMedia, onError);
  const value = useSyncExternalStore(store.subscribe, store.getDraft, store.getDraft);
  const body = normalizeText(value);
  const wasRecording = useRef(false);
  useEffect(() => {
    if (wasRecording.current && !recorder.recording) microphone.current?.focus();
    wasRecording.current = recorder.recording !== null;
  }, [recorder.recording]);
  async function select(input: HTMLInputElement, kind: "photo" | "file") {
    const files = [...(input.files ?? [])];
    input.value = "";
    if (!files.length) return;
    try {
      const media = await selectedMedia(files, kind);
      if (alive.current) onMedia(media);
    } catch (cause) {
      if (alive.current)
        onError(
          cause instanceof Error ? cause.message : "Couldn't read that attachment. Choose another.",
        );
    }
  }
  return (
    <>
      <input
        ref={photo}
        type="file"
        hidden
        multiple
        accept="image/jpeg,image/png,image/webp,image/gif"
        aria-label="Choose photos"
        onChange={(event) => {
          void select(event.currentTarget, "photo");
        }}
      />
      <input
        ref={file}
        type="file"
        hidden
        multiple
        aria-label="Choose files"
        onChange={(event) => {
          void select(event.currentTarget, "file");
        }}
      />
      <Composer
        title={title}
        value={value}
        onChange={onChange}
        onSend={onSend}
        onBlur={onBlur}
        sendDisabled={!body.trim() || body.length > 4000}
        mode={null}
        onCancelMode={laterJourney}
        onEditLast={laterJourney}
        attachOpen={attachOpen}
        onAttachOpenChange={setAttachOpen}
        onPickAttachment={(kind) => {
          setAttachOpen(false);
          (kind === "photo" ? photo : file).current?.click();
        }}
        onRecord={recorder.start}
        onMicrophoneMount={(element) => {
          microphone.current = element;
        }}
        recording={recorder.recording}
        onCancelRecording={recorder.cancel}
        onSendRecording={recorder.send}
      />
    </>
  );
}
