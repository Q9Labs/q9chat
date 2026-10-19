import { useEffect, useRef, useState } from "react";

import { Icon } from "../ui/icons.js";
import { durationLabel, fileMeta } from "./format.js";
import type { Attachment } from "./types.js";

type ImageAttachment = Extract<Attachment, { kind: "image" }>;
type FileAttachment = Extract<Attachment, { kind: "file" }>;
type VoiceAttachment = Extract<Attachment, { kind: "voice" }>;

/** A photo, 320px wide at most, with a 14px radius. */
export function ImageTile({ image }: { readonly image: ImageAttachment }) {
  return (
    <a
      href={image.url || undefined}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Open image"
    >
      <img
        className="photo"
        src={image.url || undefined}
        alt={image.url ? image.label : "Loading image"}
        width={image.width}
        height={image.height}
        style={{ aspectRatio: `${image.width} / ${image.height}` }}
      />
    </a>
  );
}

/** A file as a card: icon, name and "84 KB · PDF". */
export function FileCard({ file }: { readonly file: FileAttachment }) {
  return (
    <a className="file" href={file.url || undefined} aria-disabled={!file.url} download={file.name}>
      <span className="fi">
        <Icon name="file" />
      </span>
      <span>
        <b>{file.name}</b>
        <small>{fileMeta(file.size, file.name, file.contentType)}</small>
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
  readonly onError: (error: string) => void;
  /** 0 to 1 while playing, null when stopped. */
  readonly progress: number | null;
  readonly onTogglePlay: () => void;
}

/** A voice note: play or pause, a 38-bar waveform and the elapsed or total time. */
let activeAudio: HTMLAudioElement | null = null;
export function VoiceRow({ voice, onError }: VoiceRowProps) {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState("");
  const done = elapsed / voice.durationMs;
  useEffect(() => {
    const element = audio.current;
    return () => {
      element?.pause();
      if (activeAudio === element) activeAudio = null;
    };
  }, []);
  function playbackError() {
    const copy = "Couldn't play this voice note. Try again or download it.";
    setPlaying(false);
    setError(copy);
    onError(copy);
  }
  async function toggle() {
    const element = audio.current;
    if (!element) return;
    setError("");
    if (!element.paused) {
      element.pause();
      return;
    }
    if (activeAudio && activeAudio !== element) activeAudio.pause();
    activeAudio = element;
    try {
      if (element.error) element.load();
      await element.play();
    } catch {
      playbackError();
    }
  }
  return (
    <div className="voice">
      {/* Voice notes have no supplied transcript; do not invent a caption track. */}
      {/* oxlint-disable-next-line jsx-a11y/media-has-caption -- Voice notes are user audio without a transcript. */}
      <audio
        ref={audio}
        src={voice.url || undefined}
        preload="none"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={(event) => setElapsed(event.currentTarget.currentTime * 1000)}
        onEnded={() => {
          setPlaying(false);
          setElapsed(0);
        }}
        onError={playbackError}
      />
      <button
        type="button"
        className="play"
        disabled={!voice.url}
        aria-label={playing ? "Pause voice note" : "Play voice note"}
        onClick={() => {
          void toggle();
        }}
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
        {durationLabel(playing || elapsed > 0 ? elapsed : voice.durationMs)}
      </span>
      {error ? (
        <span>
          {error}{" "}
          <a href={voice.url} download="voice-note">
            Download voice note
          </a>
        </span>
      ) : null}
    </div>
  );
}
