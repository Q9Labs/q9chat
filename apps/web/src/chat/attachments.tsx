import { Icon } from "../ui/icons.js";
import { durationLabel, fileMeta } from "./format.js";
import type { Attachment } from "./types.js";

type ImageAttachment = Extract<Attachment, { kind: "image" }>;
type FileAttachment = Extract<Attachment, { kind: "file" }>;
type VoiceAttachment = Extract<Attachment, { kind: "voice" }>;

/** A photo, 320px wide at most, with a 14px radius. */
export function ImageTile({ image }: { readonly image: ImageAttachment }) {
  return (
    <img
      className="photo"
      src={image.url}
      alt={image.label}
      width={image.width}
      height={image.height}
      style={{ aspectRatio: `${image.width} / ${image.height}` }}
    />
  );
}

/** A file as a card: icon, name and "84 KB · PDF". */
export function FileCard({ file }: { readonly file: FileAttachment }) {
  return (
    <a className="file" href={file.url} download={file.name}>
      <span className="fi">
        <Icon name="file" />
      </span>
      <span>
        <b>{file.name}</b>
        <small>{fileMeta(file.size, file.name)}</small>
      </span>
    </a>
  );
}

const BARS = 38;

function barHeights(waveform: readonly number[]): readonly number[] {
  return Array.from({ length: BARS }, (_, bar) => {
    const peak = waveform[Math.floor((bar * waveform.length) / BARS)] ?? 0;
    return Math.max(4, 5 + Math.round(peak * 19));
  });
}

interface VoiceRowProps {
  readonly voice: VoiceAttachment;
  /** 0 to 1 while playing, null when stopped. */
  readonly progress: number | null;
  readonly onTogglePlay: () => void;
}

/** A voice note: play or pause, a 38-bar waveform and the elapsed or total time. */
export function VoiceRow({ voice, progress, onTogglePlay }: VoiceRowProps) {
  const playing = progress !== null;
  const done = progress ?? 0;
  return (
    <div className="voice">
      <button
        type="button"
        className="play"
        aria-label={playing ? "Pause voice note" : "Play voice note"}
        onClick={onTogglePlay}
      >
        <Icon name={playing ? "pause" : "play"} />
      </button>
      <span className="wave" aria-hidden="true">
        {barHeights(voice.waveform).map((height, bar) => (
          // The bar index is the identity: the bars never reorder.
          // oxlint-disable-next-line react/no-array-index-key
          <i key={bar} className={bar / BARS < done ? "on" : undefined} style={{ height }} />
        ))}
      </span>
      <span className="dur">
        {durationLabel(playing ? voice.durationMs * done : voice.durationMs)}
      </span>
    </div>
  );
}
