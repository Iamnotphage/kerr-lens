export const DISK_FLOW_COHERENCE_TIME = 12;
export const DISK_FLOW_SEED_PERIOD = 97;
export const DISK_FLOW_TIME_PERIOD =
  DISK_FLOW_COHERENCE_TIME * DISK_FLOW_SEED_PERIOD;

/**
 * The shader's finite-age flow repeats after all seed epochs have cycled.
 * Keeping the GPU clock inside that exact period prevents highp-float phase
 * loss during long-running tabs without introducing a visual reset.
 */
export function wrapDiskFlowTime(simulationTime: number): number {
  if (!Number.isFinite(simulationTime)) {
    throw new RangeError("Simulation time must be finite.");
  }
  const wrapped = simulationTime % DISK_FLOW_TIME_PERIOD;
  return wrapped < 0 ? wrapped + DISK_FLOW_TIME_PERIOD : wrapped;
}
