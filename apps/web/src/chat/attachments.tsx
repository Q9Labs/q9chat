import { useEffect, useRef, useState } from "react";

import { Icon } from "../ui/icons.js";
import { durationLabel, fileMeta } from "./format.js";
import type { Attachment, MediaResource } from "./types.js";

type ImageAttachment = Extract<Attachment, { kind: "image" }>;
type FileAttachment = Extract<Attachment, { kind: "file" }>;
type VoiceAttachment = Extract<Attachment, { kind: "voice" }>;

function useResourceLifetime(resource: MediaResource | undefined) {
  const path = resource?.path;
  const retain = resource?.retain;
  const release = resource?.release;
  useEffect(() => {
    if (path) retain?.(path);
    return () => {
      if (path) release?.(path);
    };
  }, [path, retain, release]);
}

/** Only visible images own display bytes; dimensions remain reserved while released. */
export function ImageTile({ image }: { readonly image: ImageAttachment }) {
  const anchor = useRef<HTMLAnchorElement>(null);
  const { path, load, retain, release } = image.resource ?? {};
  useEffect((): (() => void) | undefined => {
    const node = anchor.current;
    if (!node || !path || !load || !retain || !release) return undefined;
    let visible = false;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting && !visible) {
        visible = true;
        retain(path);
        void load(path).catch(() => {});
      } else if (!entry?.isIntersecting && visible) {
        visible = false;
        release(path);
      }
    });
    observer.observe(node);
    return () => {
      observer.disconnect();
      if (visible) release(path);
    };
  }, [path, load, retain, release]);
  return (
    <a
      ref={anchor}
      href={image.url || "#"}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Open image"
      onClick={(event) => {
        if (!image.url && path && load) {
          event.preventDefault();
          void load(path).catch(() => {});
        }
      }}
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

/** Activate to fetch private bytes, then hand the browser a credential-free download. */
export function FileCard({ file }: { readonly file: FileAttachment }) {
  useResourceLifetime(file.resource);
  return (
    // eslint-disable-next-line react-doctor/no-prevent-default -- Safe because native navigation must wait for authenticated bytes; only the resulting credential-free Blob URL may be downloaded.
    <a
      className="file"
      href={file.url || "#"}
      tabIndex={0}
      download={file.name}
      onKeyDown={(event) => {
        if (event.key === "Enter" && !file.url) {
          event.preventDefault();
          event.currentTarget.click();
        }
      }}
      onClick={(event) => {
        if (!file.resource) return;
        event.preventDefault();
        void file.resource
          .load(file.resource.path)
          .then((url) => {
            const link = document.createElement("a");
            link.href = url;
            link.download = file.name;
            link.click();
          })
          .catch(() => {});
      }}
    >
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
}

function voiceSource(voice: VoiceAttachment) {
  return voice.resource ? undefined : voice.url || undefined;
}

function Waveform({
  waveform,
  progress,
}: {
  readonly waveform: readonly number[];
  readonly progress: number;
}) {
  return (
    <span className="wave" aria-hidden="true">
      {barHeights(waveform).map((height, bar) => (
        // The bar index is the identity: the bars never reorder.
        // oxlint-disable-next-line react/no-array-index-key
        <i key={bar} className={bar / BARS < progress ? "on" : undefined} style={{ height }} />
      ))}
    </span>
  );
}

async function playVoice(element: HTMLAudioElement, voice: VoiceAttachment) {
  if (voice.resource) {
    // eslint-disable-next-line react-doctor/async-defer-await -- Safe because the node can unmount while private bytes load; this guard must run after the await.
    const url = await voice.resource.load(voice.resource.path);
    if (!element.isConnected || activeAudio !== element) return;
    if (element.src !== url) element.src = url;
  }
  if (element.error) element.load();
  await element.play();
}

/** A voice note: play or pause, a 38-bar waveform and the elapsed or total time. */
let activeAudio: HTMLAudioElement | null = null;
function useVoiceAudio(voice: VoiceAttachment) {
  const audio = useRef<HTMLAudioElement>(null);
  useResourceLifetime(voice.resource);
  const path = voice.resource?.path;
  useEffect(() => {
    const element = audio.current;
    if (path && !voice.url && element) {
      element.pause();
      element.removeAttribute("src");
      element.load();
    }
  }, [path, voice.url]);
  useEffect(() => {
    const element = audio.current;
    return () => {
      element?.pause();
      if (activeAudio === element) activeAudio = null;
    };
  }, []);
  return audio;
}

export function VoiceRow({ voice, onError }: VoiceRowProps) {
  const audio = useVoiceAudio(voice);
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState("");
  const failed = useRef(false);
  const icon = playing ? "pause" : "play";
  function playbackError() {
    if (failed.current) return;
    failed.current = true;
    const copy = "Couldn't play this voice note. Try again or download it.";
    setPlaying(false);
    setError(copy);
    onError(copy);
  }
  async function toggle() {
    const element = audio.current;
    if (!element) return;
    failed.current = false;
    setError("");
    onError("");
    if (!element.paused) {
      element.pause();
      return;
    }
    if (activeAudio && activeAudio !== element) activeAudio.pause();
    activeAudio = element;
    try {
      await playVoice(element, voice);
    } catch {
      if (element.isConnected) playbackError();
    }
  }
  return (
    <div className="voice">
      {/* Voice notes have no supplied transcript; do not invent a caption track. */}
      {/* oxlint-disable-next-line jsx-a11y/media-has-caption -- Voice notes are user audio without a transcript. */}
      <audio
        ref={audio}
        src={voiceSource(voice)}
        preload="none"
        onPlay={() => {
          setPlaying(true);
          setError("");
          onError("");
        }}
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
        disabled={!voice.url && !voice.resource}
        aria-label={playing ? "Pause voice note" : "Play voice note"}
        onClick={() => {
          void toggle();
        }}
      >
        <Icon name={icon} />
      </button>
      <Waveform waveform={voice.waveform} progress={elapsed / voice.durationMs} />
      <span className="dur">
        {durationLabel(playing || elapsed > 0 ? elapsed : voice.durationMs)}
      </span>
      {error ? (
        <span>
          {error}{" "}
          <a href={voice.url} download="voice-note" hidden={!voice.url}>
            Download voice note
          </a>
        </span>
      ) : null}
    </div>
  );
}
