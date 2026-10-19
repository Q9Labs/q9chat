import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import { File } from "expo-file-system";
import { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";

import { initialRecording, recordingStep, type RecordingEvent } from "./recordingState";
import type { LocalAttachment } from "./textState";

export function useVoiceRecording(
  onSend: (file: LocalAttachment) => void,
  notice: (text: string) => void,
) {
  const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true });
  const native = useAudioRecorderState(recorder, 200);
  const [state, setState] = useState(initialRecording);
  const current = useRef(initialRecording);
  const busy = useRef(false);
  const prepared = useRef(false);
  const [levels, setLevels] = useState<number[]>([]);
  function step(event: RecordingEvent) {
    const next = recordingStep(current.current, event);
    current.current = next;
    setState(next);
    return next;
  }
  useEffect(() => {
    const interval = setInterval(() => {
      const status = recorder.getStatus();
      if (!status.isRecording || status.metering === undefined) return;
      const sample = Math.max(0, Math.min(1, Math.pow(10, status.metering / 20)));
      setLevels((previous) => [...previous.slice(-63), sample]);
    }, 200);
    return () => clearInterval(interval);
  }, [recorder]);
  useEffect(
    () => () => {
      current.current = recordingStep(current.current, { type: "cancel" });
    },
    [],
  );
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) => {
      if (
        (next !== "active" && current.current.phase === "recording") ||
        (next === "background" && current.current.phase === "starting")
      ) {
        void finish(false);
        notice("Recording cancelled when you left the app.");
      }
    });
    return () => subscription.remove();
  });
  async function release() {
    try {
      if (prepared.current) await recorder.stop();
    } catch {
      notice("Couldn't release the microphone. Close this group and try again.");
    } finally {
      prepared.current = false;
      try {
        await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
      } catch {
        notice("Couldn't release the microphone. Close this group and try again.");
      }
    }
  }
  async function prepare(attempt: number) {
    const permission = await AudioModule.requestRecordingPermissionsAsync();
    if (current.current.attempt !== attempt) return;
    if (!permission.granted) {
      step({ type: "failed", attempt });
      notice("Allow microphone access in Settings to record a voice note.");
      return;
    }
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    if (current.current.attempt !== attempt) return;
    await recorder.prepareToRecordAsync();
    prepared.current = true;
    if (current.current.attempt !== attempt) return;
    setLevels([]);
    recorder.record({ forDuration: 600 });
    step({ type: "ready", attempt });
  }
  async function start() {
    if (busy.current || !["closed", "failed"].includes(current.current.phase)) return;
    busy.current = true;
    notice("");
    const { attempt } = step({ type: "open" });
    try {
      await prepare(attempt);
    } catch {
      if (current.current.attempt === attempt) {
        step({ type: "failed", attempt });
        notice("Couldn't start recording. Try again.");
      }
    } finally {
      if (current.current.attempt !== attempt || current.current.phase === "failed")
        await release();
      busy.current = false;
    }
  }
  async function cancel() {
    const before = current.current.phase;
    if (before === "finishing") return;
    step({ type: "cancel" });
    if (busy.current || before !== "recording") return;
    busy.current = true;
    await release();
    busy.current = false;
  }
  async function sendRecording() {
    const { attempt, phase } = current.current;
    if (busy.current || phase !== "recording") return;
    busy.current = true;
    step({ type: "finish", attempt });
    try {
      const durationMs = Math.min(600_000, recorder.currentTime * 1000);
      await recorder.stop();
      prepared.current = false;
      const uri = recorder.uri;
      if (!uri || durationMs <= 0) {
        notice("Record a little longer before sending.");
      } else {
        onSend({
          kind: "voice",
          uri,
          size: new File(uri).size,
          contentType: "audio/mp4",
          durationMs,
          waveform: levels,
        });
      }
      step({ type: "stopped", attempt });
    } catch {
      step({ type: "failed", attempt });
      notice("Couldn't finish recording. Try again.");
    } finally {
      await release();
      busy.current = false;
    }
  }
  function finish(send: boolean) {
    return send ? sendRecording() : cancel();
  }
  return {
    mode:
      state.phase === "closed"
        ? null
        : {
            kind: "recording" as const,
            phase: state.phase,
            seconds: Math.floor(native.durationMillis / 1000),
            levels,
          },
    start,
    finish,
  };
}
