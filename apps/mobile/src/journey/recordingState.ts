export type RecordingState = {
  phase: "closed" | "starting" | "recording" | "finishing" | "failed";
  attempt: number;
};
export type RecordingEvent =
  | { type: "open" }
  | { type: "cancel" }
  | { type: "ready" | "finish" | "stopped" | "failed"; attempt: number };

export const initialRecording: RecordingState = { phase: "closed", attempt: 0 };

const transitions = {
  ready: { from: "starting", to: "recording" },
  finish: { from: "recording", to: "finishing" },
  stopped: { from: "finishing", to: "closed" },
} satisfies Record<
  "ready" | "finish" | "stopped",
  { from: RecordingState["phase"]; to: RecordingState["phase"] }
>;
function openRecording(state: RecordingState): RecordingState {
  return state.phase === "closed" || state.phase === "failed"
    ? { phase: "starting", attempt: state.attempt + 1 }
    : state;
}
/** Late native completions cannot reopen a cancelled or newer recording. */
export function recordingStep(state: RecordingState, event: RecordingEvent): RecordingState {
  if (event.type === "cancel") return { phase: "closed", attempt: state.attempt + 1 };
  if (event.type === "open") return openRecording(state);
  if (event.attempt !== state.attempt) return state;
  if (event.type === "failed")
    return state.phase === "closed" ? state : { ...state, phase: "failed" };
  const transition = transitions[event.type];
  return state.phase === transition.from ? { ...state, phase: transition.to } : state;
}
