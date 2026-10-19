import { useCallback, useEffect, useRef, useState } from "react";

import type { Recording } from "../chat/composer.js";
import { durationLabel } from "../chat/format.js";
import type { Media } from "./media-storage.js";

interface Capture {
  readonly recorder: MediaRecorder;
  readonly stream: MediaStream;
  readonly context: AudioContext;
  readonly timer: ReturnType<typeof setInterval>;
  readonly started: number;
  readonly readPeak: () => number;
  readonly chunks: Blob[];
  readonly waveform: number[];
  send: boolean;
  durationMs: number;
}
function validRecording(blob: Blob, durationMs: number) {
  return blob.size > 0 && blob.size <= 20_000_000 && durationMs > 0 && durationMs <= 600_000;
}
function recordingAvailable() {
  return (
    "mediaDevices" in navigator &&
    "getUserMedia" in navigator.mediaDevices &&
    typeof MediaRecorder !== "undefined"
  );
}
function captureFailure(cause: unknown) {
  if (cause instanceof DOMException && cause.name === "NotAllowedError")
    return "Microphone access was denied. Allow it in browser settings and try again.";
  if (cause instanceof DOMException && cause.name === "NotFoundError")
    return "No microphone found. Connect one and try again.";
  return "Couldn't start recording. Check your microphone or send an audio file.";
}
function stopTracks(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}
function closeAudio(context: AudioContext, onError: (error: string) => void) {
  void context
    .close()
    .catch(() => onError("Couldn't close the audio device. Reload before recording again."));
}
function audioSampler(stream: MediaStream, onError: (error: string) => void) {
  const context = new AudioContext();
  try {
    const analyser = context.createAnalyser();
    analyser.fftSize = 256;
    context.createMediaStreamSource(stream).connect(analyser);
    const samples = new Uint8Array(analyser.fftSize);
    return {
      context,
      readPeak: () => {
        analyser.getByteTimeDomainData(samples);
        return Math.max(...samples.map((sample) => Math.abs(sample - 128))) / 128;
      },
    };
  } catch (cause) {
    closeAudio(context, onError);
    throw cause;
  }
}
function createCapture(
  stream: MediaStream,
  tick: () => void,
  onError: (error: string) => void,
): Capture {
  const mimeType = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus"].find((type) =>
    MediaRecorder.isTypeSupported(type),
  );
  if (!mimeType) throw new Error("No supported recording format");
  const recorder = new MediaRecorder(stream, { mimeType });
  const sampler = audioSampler(stream, onError);
  return {
    recorder,
    stream,
    ...sampler,
    timer: setInterval(tick, 100),
    started: performance.now(),
    chunks: [],
    waveform: [],
    send: false,
    durationMs: 0,
  };
}
export function useVoiceRecorder(
  onSend: (media: readonly Media[]) => void,
  onError: (error: string) => void,
) {
  const [recording, setRecording] = useState<Recording | null>(null);
  const capture = useRef<Capture | null>(null);
  const owner = useRef({ active: true, requesting: false });
  const release = useCallback(
    (value: Capture) => {
      clearInterval(value.timer);
      value.stream.getTracks().forEach((track) => track.stop());
      closeAudio(value.context, onError);
    },
    [onError],
  );
  const cancel = useCallback(() => {
    const value = capture.current;
    capture.current = null;
    if (value) {
      value.send = false;
      if (value.recorder.state !== "inactive") value.recorder.stop();
      release(value);
    }
    if (owner.current.active) setRecording(null);
  }, [release]);
  useEffect(() => {
    const current = owner.current;
    current.active = true;
    return () => {
      current.active = false;
      cancel();
    };
  }, [cancel]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (recording && event.key === "Escape") {
        event.preventDefault();
        cancel();
      }
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [recording, cancel]);
  function observeCapture(value: Capture) {
    value.recorder.ondataavailable = (event) => {
      if (event.data.size) value.chunks.push(event.data);
      if (value.chunks.reduce((total, chunk) => total + chunk.size, 0) > 20_000_000) {
        cancel();
        onError("That recording is over 20 MB. Record a shorter note.");
      }
    };
    value.recorder.addEventListener("error", () => {
      cancel();
      onError("Recording stopped unexpectedly. Check your microphone and try again.");
    });
    value.stream.getAudioTracks().forEach((track) => {
      track.addEventListener("ended", () => {
        if (capture.current === value && !value.send) {
          cancel();
          onError("The microphone disconnected. Connect it and record again.");
        }
      });
    });
    value.recorder.onstop = () => {
      if (capture.current !== value) return;
      capture.current = null;
      release(value);
      if (!owner.current.active) return;
      setRecording(null);
      if (!value.send) return;
      const blob = new Blob(value.chunks, { type: value.recorder.mimeType });
      if (!validRecording(blob, value.durationMs)) {
        onError("Couldn't save that recording. Record a shorter note and try again.");
        return;
      }
      onSend([
        { kind: "voice", blob, durationMs: value.durationMs, waveform: [...value.waveform] },
      ]);
    };
  }
  function tick() {
    const current = capture.current;
    if (!current) return;
    const elapsed = performance.now() - current.started;
    if (elapsed > 600_000) {
      cancel();
      onError("Voice notes can be up to ten minutes. Record a shorter note.");
      return;
    }
    current.waveform.push(current.readPeak());
    if (current.waveform.length > 64)
      current.waveform.splice(
        0,
        current.waveform.length,
        ...current.waveform.filter((_, index) => index % 2 === 0),
      );
    setRecording({ elapsed: durationLabel(elapsed), levels: [...current.waveform] });
  }
  function releaseFailedStart(stream: MediaStream | null) {
    if (capture.current) cancel();
    else stopTracks(stream);
  }
  async function start() {
    if (capture.current || owner.current.requesting) return;
    if (!recordingAvailable()) {
      onError(
        "Voice recording isn't supported in this browser. Try another browser or send an audio file.",
      );
      return;
    }
    owner.current.requesting = true;
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!owner.current.active) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      const value = createCapture(stream, tick, onError);
      capture.current = value;
      observeCapture(value);
      value.recorder.start(250);
      onError("");
      setRecording({ elapsed: "0:00", levels: [] });
    } catch (cause) {
      releaseFailedStart(stream);
      if (owner.current.active) onError(captureFailure(cause));
    } finally {
      owner.current.requesting = false;
    }
  }
  return {
    recording,
    start: () => {
      void start();
    },
    cancel,
    send: () => {
      const value = capture.current;
      if (!value || value.recorder.state === "inactive") return;
      value.durationMs = performance.now() - value.started;
      if (value.durationMs > 600_000) {
        cancel();
        onError("Voice notes can be up to ten minutes. Record a shorter note.");
        return;
      }
      value.send = true;
      value.recorder.stop();
    },
  };
}
