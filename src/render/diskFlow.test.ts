import { describe, expect, it } from "vitest";

import fragmentShader from "../shaders/black-hole.frag.glsl?raw";
import {
  DISK_FLOW_COHERENCE_TIME,
  DISK_FLOW_SEED_PERIOD,
  DISK_FLOW_TIME_PERIOD,
  wrapDiskFlowTime,
} from "./diskFlow";

describe("finite-coherence disk flow", () => {
  it("keeps the CPU and shader renewal constants synchronized", () => {
    expect(fragmentShader).toContain(
      `const float FLOW_COHERENCE_TIME = ${DISK_FLOW_COHERENCE_TIME.toFixed(1)};`,
    );
    expect(fragmentShader).toContain(
      `const float FLOW_SEED_PERIOD = ${DISK_FLOW_SEED_PERIOD.toFixed(1)};`,
    );
  });

  it("wraps only at the exact full seed cycle", () => {
    expect(DISK_FLOW_TIME_PERIOD).toBe(1_164);
    expect(wrapDiskFlowTime(0)).toBe(0);
    expect(wrapDiskFlowTime(DISK_FLOW_TIME_PERIOD - 0.25)).toBe(
      DISK_FLOW_TIME_PERIOD - 0.25,
    );
    expect(wrapDiskFlowTime(DISK_FLOW_TIME_PERIOD)).toBe(0);
    expect(wrapDiskFlowTime(86_400)).toBe(264);
    expect(wrapDiskFlowTime(-0.25)).toBe(DISK_FLOW_TIME_PERIOD - 0.25);
  });

  it("rejects clocks that cannot produce a stable GPU phase", () => {
    expect(() => wrapDiskFlowTime(Number.POSITIVE_INFINITY)).toThrow(RangeError);
    expect(() => wrapDiskFlowTime(Number.NaN)).toThrow(RangeError);
  });
});
