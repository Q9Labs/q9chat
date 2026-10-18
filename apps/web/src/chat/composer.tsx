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

/** The message pill: attach, a textarea that grows with its text, then a mic that becomes send. */
export function Composer(props: ComposerProps) {
  const {
    title,
    value,
    onChange,
    onSend,
    mode,
    onCancelMode,
    onEditLast,
    attachOpen,
    onAttachOpenChange,
    onPickAttachment,
    onRecord,
    recording,
    onCancelRecording,
    onSendRecording,
  } = props;
  const field = useRef<HTMLTextAreaElement>(null);
  const [attach, setAttach] = useState<HTMLButtonElement | null>(null);
  const editing = mode?.type === "edit";

  useLayoutEffect(() => {
    const el = field.current;
    if (el === null) return;
    el.style.height = "36px";
    el.style.height = `${Math.min(140, el.scrollHeight)}px`;
  }, [value]);

  useEffect(() => {
    if (mode !== null) field.current?.focus({ preventScroll: true });
  }, [mode]);

  if (recording !== null) {
    return (
      <div className="composer">
        <output className="recbar">
          <span className="recdot" aria-hidden="true" />
          <span>Recording</span>
          <span className="dur">{recording.elapsed}</span>
          <span className="wave" aria-hidden="true">
            {recordingBars(recording.levels).map((height, bar) => (
              // oxlint-disable-next-line react/no-array-index-key -- fixed bars that never reorder
              <i key={bar} className="on" style={{ height }} />
            ))}
          </span>
          <Button onClick={onCancelRecording}>Cancel</Button>
          <button
            type="button"
            className="send"
            aria-label="Send voice note"
            onClick={onSendRecording}
          >
            <Icon name="up" />
          </button>
        </output>
      </div>
    );
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      onSend();
    } else if (event.key === "Escape" && mode !== null) {
      event.preventDefault();
      onCancelMode();
    } else if (event.key === "ArrowUp" && value === "" && mode === null) {
      event.preventDefault();
      onEditLast();
    }
  };

  return (
    <div className="composer">
      {mode?.type === "reply" ? (
        <div className="cbar">
          <Icon name="reply" />
          <span>
            Replying to <b>{mode.to}</b> · {mode.summary}
          </span>
          <IconButton icon="x" label="Cancel reply" onClick={onCancelMode} />
        </div>
      ) : null}
      {editing ? (
        <div className="cbar">
          <Icon name="pencil" />
          <span>
            <b>Editing message</b> · Esc to cancel
          </span>
          <IconButton icon="x" label="Cancel editing" onClick={onCancelMode} />
        </div>
      ) : null}
      <div className="field">
        {editing ? null : (
          <button
            ref={setAttach}
            type="button"
            className="ib"
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
        />
        {editing ? null : (
          <button
            type="button"
            className="ib rec"
            aria-label="Record a voice note"
            onClick={onRecord}
          >
            <Icon name="mic" />
          </button>
        )}
        <button
          type="button"
          className={`send${editing ? " keep" : ""}`}
          aria-label={editing ? "Save edit" : "Send"}
          onClick={onSend}
        >
          <Icon name={editing ? "check" : "up"} />
        </button>
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
