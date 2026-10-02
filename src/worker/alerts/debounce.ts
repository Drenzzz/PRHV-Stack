// Alert debounce state machine (REQ-018, REQ-019).
// Pure functions — transitions evaluated per probe outcome; persistence lives
// in incidents.ts. Thresholds come from the monitor's alert_rules (defaults 3/2).

export interface DebounceState {
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  hasOpenIncident: boolean;
}

export type DebounceAction =
  | { kind: "none" }
  | { kind: "open" }
  | { kind: "resolve" };

export function nextDebounceState(
  state: DebounceState,
  ok: boolean,
  failureThreshold: number,
  recoveryThreshold: number,
): { state: DebounceState; action: DebounceAction } {
  if (ok) {
    const successes = state.consecutiveSuccesses + 1;
    const next: DebounceState = {
      consecutiveFailures: 0,
      consecutiveSuccesses: successes,
      hasOpenIncident: state.hasOpenIncident,
    };
    if (state.hasOpenIncident && successes >= recoveryThreshold) {
      next.hasOpenIncident = false;
      return { state: next, action: { kind: "resolve" } };
    }
    return { state: next, action: { kind: "none" } };
  }

  const failures = state.consecutiveFailures + 1;
  const next: DebounceState = {
    consecutiveFailures: failures,
    consecutiveSuccesses: 0,
    hasOpenIncident: state.hasOpenIncident,
  };
  if (!state.hasOpenIncident && failures >= failureThreshold) {
    next.hasOpenIncident = true;
    return { state: next, action: { kind: "open" } };
  }
  return { state: next, action: { kind: "none" } };
}
