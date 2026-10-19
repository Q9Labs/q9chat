export type RecordingState = {
  phase: "closed" | "starting" | "recording" | "finishing" | "failed";
  attempt: number;
};
export type RecordingEvent =
  | { type: "open" }
  | { type: "cancel" }
  | { type: "interrupt" }
  | { type: "ready" | "finish" | "stopped" | "failed"; attempt: number };

export const initialRecording: RecordingState = { phase: "closed", attempt: 0 };

type NativeEvent = Extract<RecordingEvent, { attempt: number }>;
const transitions: Record<
  NativeEvent["type"],
  { from: readonly RecordingState["phase"][]; to: RecordingState["phase"] }
> = {
  ready: { from: ["starting"], to: "recording" },
  finish: { from: ["recording"], to: "finishing" },
  stopped: { from: ["finishing"], to: "closed" },
  failed: { from: ["starting", "recording", "finishing", "failed"], to: "failed" },
};
function closeRecording(state: RecordingState, type: "cancel" | "interrupt"): RecordingState {
  if (type === "interrupt" && state.phase !== "recording") return state;
  return { phase: "closed", attempt: state.attempt + 1 };
}
function openRecording(state: RecordingState): RecordingState {
  return state.phase === "closed" || state.phase === "failed"
    ? { phase: "starting", attempt: state.attempt + 1 }
    : state;
}
/** Late native completions cannot reopen a cancelled or newer recording. */
export function recordingStep(state: RecordingState, event: RecordingEvent): RecordingState {
  if (event.type === "cancel" || event.type === "interrupt")
    return closeRecording(state, event.type);
  if (event.type === "open") return openRecording(state);
  if (event.attempt !== state.attempt) return state;
  const transition = transitions[event.type];
  return transition.from.includes(state.phase) ? { ...state, phase: transition.to } : state;
}
