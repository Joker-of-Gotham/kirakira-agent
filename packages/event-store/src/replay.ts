import type { Checkpoint, RunState } from "./types.js";
import { stableStringify } from "./types.js";
import { RunStateProjector } from "./projector.js";
import { EventReader } from "./event-reader.js";

export function replay(
  runId: string,
  reader: EventReader,
  projector?: RunStateProjector,
): RunState {
  const proj = projector ?? new RunStateProjector();
  const events = reader.readAll(runId);
  return proj.project(events);
}

export function replayFromCheckpoint(
  runId: string,
  checkpoint: Checkpoint,
  reader: EventReader,
  projector?: RunStateProjector,
): RunState {
  const proj = projector ?? new RunStateProjector();
  const state = structuredClone(checkpoint.state) as RunState;
  state.researchRuns ??= {};
  const tailEvents = reader.readSinceCheckpoint(runId, checkpoint.seq);

  for (const event of tailEvents) {
    proj.apply(state, event);
  }
  return state;
}

export function validateReplay(stateA: RunState, stateB: RunState): boolean {
  return stableStringify(stateA) === stableStringify(stateB);
}
