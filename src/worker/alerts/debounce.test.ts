import { expect, test } from "bun:test";
import { nextDebounceState } from "./debounce";

// TEST-002: debounce FSM — 3-fail opens exactly once, 2-success resolves, flaps.

const fresh = { consecutiveFailures: 0, consecutiveSuccesses: 0, hasOpenIncident: false };
const withIncident = { consecutiveFailures: 3, consecutiveSuccesses: 0, hasOpenIncident: true };

function run(seq: ("ok" | "fail")[], start = fresh) {
  let state = start;
  const actions = [];
  for (const s of seq) {
    const r = nextDebounceState(state, s === "ok", 3, 2);
    state = r.state;
    actions.push(r.action.kind);
  }
  return { state, actions };
}

test("3 consecutive failures open exactly once (REQ-018)", () => {
  const { state, actions } = run(["fail", "fail", "fail"]);
  expect(actions).toEqual(["none", "none", "open"]);
  expect(state.hasOpenIncident).toBe(true);
});

test("1-2 failures do not open", () => {
  expect(run(["fail"]).actions).toEqual(["none"]);
  expect(run(["fail", "fail"]).actions).toEqual(["none", "none"]);
});

test("2 consecutive successes resolve an open incident (REQ-019)", () => {
  const { state, actions } = run(["ok", "ok"], withIncident);
  expect(actions).toEqual(["none", "resolve"]);
  expect(state.hasOpenIncident).toBe(false);
});

test("1 success keeps the incident open", () => {
  const { actions } = run(["ok"], withIncident);
  expect(actions).toEqual(["none"]);
});

test("flap sequence: fail,fail,ok,fail,fail,fail → one incident on the second streak (TEST-002)", () => {
  const { state, actions } = run(["fail", "fail", "ok", "fail", "fail", "fail"]);
  expect(actions).toEqual(["none", "none", "none", "none", "none", "open"]);
  expect(state.hasOpenIncident).toBe(true);
  expect(state.consecutiveFailures).toBe(3);
});

test("success resets the failure counter (no carry-over)", () => {
  const { state, actions } = run(["fail", "fail", "ok", "fail"]);
  expect(actions).toEqual(["none", "none", "none", "none"]);
  expect(state.consecutiveFailures).toBe(1);
});

test("no second open while incident already open", () => {
  const { actions } = run(["fail", "fail"], withIncident);
  expect(actions).toEqual(["none", "none"]);
});
