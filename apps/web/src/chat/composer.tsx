import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";

import { Button, IconButton } from "../ui/controls.js";
import { Icon } from "../ui/icons.js";
import { Menu, MenuItem } from "../ui/overlay.js";
import { shortTitle } from "./format.js";

export type ComposerMode =
  | { readonly type: "reply"; readonly to: string; readonly summary: string }
  | { readonly type: "edit" };

export interface Recording {
  readonly elapsed: string;
  /** Recent peak levels from 0 to 1, newest last. */
  readonly levels: readonly number[];
}

export interface ComposerProps {
  readonly textOnly?: boolean;
  readonly onBlur?: () => void;
  readonly sendDisabled?: boolean;
  readonly title: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly onSend: () => void;
  readonly mode: ComposerMode | null;
  readonly onCancelMode: () => void;
  /** ArrowUp in an empty composer: edit your last sent message. */
  readonly onEditLast: () => void;
  readonly attachOpen: boolean;
  readonly onAttachOpenChange: (open: boolean) => void;
  readonly onPickAttachment: (kind: "photo" | "file") => void;
  readonly onRecord: () => void;
  readonly recording: Recording | null;
  readonly onCancelRecording: () => void;
  readonly onSendRecording: () => void;
}

const RECORDING_BARS = 30;

function recordingBars(levels: readonly number[]): readonly number[] {
  return Array.from({ length: RECORDING_BARS }, (_, bar) => {
    const level = levels[levels.length - RECORDING_BARS + bar] ?? 0;
    return Math.max(4, 5 + Math.round(level * 19));
  });
}

function RecordingBar({
  recording,
  onCancel,
  onSend,
}: {
  readonly recording: Recording;
  readonly onCancel: () => void;
  readonly onSend: () => void;
}) {
  return (
    <div className="composer">
      <output className="recording-bar">
        <span className="recording-dot" aria-hidden="true" />
        <span>Recording</span>
        <span className="dur">{recording.elapsed}</span>
        <span className="wave" aria-hidden="true">
          {recordingBars(recording.levels).map((height, bar) => (
            // oxlint-disable-next-line react/no-array-index-key -- fixed bars that never reorder
            <i key={bar} className="on" style={{ height }} />
          ))}
        </span>
        <Button onClick={onCancel}>Cancel</Button>
        <button type="button" className="send" aria-label="Send voice note" onClick={onSend}>
          <Icon name="up" />
        </button>
      </output>
    </div>
  );
}

/** "Replying to Bilal · …" or "Editing message · Esc to cancel", above the pill. */
function ModeBar({
  mode,
  onCancel,
}: {
  readonly mode: ComposerMode | null;
  readonly onCancel: () => void;
}) {
  if (mode === null) return null;
  if (mode.type === "reply") {
    return (
      <div className="composer-bar">
        <Icon name="reply" />
        <span>
          Replying to <b>{mode.to}</b> · {mode.summary}
        </span>
        <IconButton icon="x" label="Cancel reply" onClick={onCancel} />
      </div>
    );
  }
  return (
    <div className="composer-bar">
      <Icon name="pencil" />
      <span>
        <b>Editing message</b> · Esc to cancel
      </span>
      <IconButton icon="x" label="Cancel editing" onClick={onCancel} />
    </div>
  );
}

function SendButton({
  editing,
  onSend,
  disabled,
}: {
  readonly disabled: boolean | undefined;
  readonly editing: boolean;
  readonly onSend: () => void;
}) {
  return (
    <button
      type="button"
      className={`send${editing ? " keep" : ""}`}
      disabled={disabled}
      aria-label={editing ? "Save edit" : "Send"}
      onClick={onSend}
    >
      <Icon name={editing ? "check" : "up"} />
    </button>
  );
}

const isSendKey = (event: KeyboardEvent<HTMLTextAreaElement>) =>
  event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing;

const isCancelKey = (event: KeyboardEvent<HTMLTextAreaElement>, mode: ComposerMode | null) =>
  event.key === "Escape" && mode !== null;

const isEditLastKey = (
  event: KeyboardEvent<HTMLTextAreaElement>,
  value: string,
  mode: ComposerMode | null,
) => event.key === "ArrowUp" && value === "" && mode === null;

type ComposerFieldProps = Omit<
  ComposerProps,
  "recording" | "onCancelRecording" | "onSendRecording"
>;

/** Attach, the textarea that grows with its text, then a mic, then send. */
function ComposerField(props: ComposerFieldProps) {
  const { title, value, onChange, onSend, mode, onCancelMode, onEditLast } = props;
  const { attachOpen, onAttachOpenChange, onPickAttachment, onRecord } = props;
  const field = useRef<HTMLTextAreaElement>(null);
  const [attach, setAttach] = useState<HTMLButtonElement | null>(null);
  const editing = mode?.type === "edit";

  useLayoutEffect(() => {
    const el = field.current;
    if (el === null) return;
    el.style.height = "36px";
    el.style.height = `${Math.min(140, el.scrollHeight)}px`;
  });

  const inMode = mode !== null;
  useEffect(() => {
    if (inMode) field.current?.focus({ preventScroll: true });
  }, [inMode]);

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (isSendKey(event)) {
      event.preventDefault();
      onSend();
    } else if (isCancelKey(event, mode)) {
      event.preventDefault();
      onCancelMode();
    } else if (isEditLastKey(event, value, mode)) {
      event.preventDefault();
      onEditLast();
    }
  };

  return (
    <>
      <div className="field">
        {editing ? null : (
          <button
            ref={setAttach}
            type="button"
            className="ib"
            disabled={props.textOnly}
            aria-label="Attach a photo or file"
            aria-haspopup="menu"
            aria-expanded={attachOpen}
            onClick={() => onAttachOpenChange(!attachOpen)}
          >
            <Icon name="clip" />
          </button>
        )}
        <textarea
          ref={field}
          rows={1}
          aria-label="Message"
          placeholder={`Message ${shortTitle(title)}`}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={onKeyDown}
          onBlur={props.onBlur}
          aria-invalid={value.length > 4000 || undefined}
        />
        {editing ? null : (
          <button
            type="button"
            className="ib rec"
            disabled={props.textOnly}
            aria-label="Record a voice note"
            onClick={onRecord}
          >
            <Icon name="mic" />
          </button>
        )}
        <SendButton editing={editing} onSend={onSend} disabled={props.sendDisabled} />
      </div>
      {attachOpen ? (
        <Menu
          label="Attach"
          anchor={attach}
          placement="above-start"
          onClose={() => onAttachOpenChange(false)}
        >
          <MenuItem icon="image" onSelect={() => onPickAttachment("photo")}>
            Photo
          </MenuItem>
          <MenuItem icon="file" onSelect={() => onPickAttachment("file")}>
            File
          </MenuItem>
        </Menu>
      ) : null}
    </>
  );
}

/** The message pill, with a reply or edit bar above it, or the recording bar in its place. */
export function Composer(props: ComposerProps) {
  const { recording, onCancelRecording, onSendRecording, mode, onCancelMode } = props;
  if (recording !== null) {
    return (
      <RecordingBar recording={recording} onCancel={onCancelRecording} onSend={onSendRecording} />
    );
  }
  return (
    <div className="composer">
      <ModeBar mode={mode} onCancel={onCancelMode} />
      <ComposerField {...props} />
    </div>
  );
}

/** Shown in place of the composer once you are no longer a member. */
export function ReadOnlyComposer() {
  return (
    <div className="composer">
      <div className="ro">
        <Icon name="lock" />
        <span>You can't send messages here because you're no longer a member.</span>
      </div>
    </div>
  );
}
