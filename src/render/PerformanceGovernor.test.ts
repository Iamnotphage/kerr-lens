import { describe, expect, it } from "vitest";

import { PerformanceGovernor, type QualityMode } from "./PerformanceGovernor";

describe("PerformanceGovernor quality selection", () => {
  it.each([
    ["performance", 0.58],
    ["balanced", 0.78],
    ["high", 1],
  ] satisfies Array<[QualityMode, number]>)(
    "holds the explicitly selected %s scale during slow frames",
    (mode, expectedScale) => {
      const governor = new PerformanceGovernor();
      governor.setMode(mode);

      for (let sample = 1; sample <= 90; sample += 1) {
        governor.update(45, sample * 20);
      }

      expect(governor.getScale()).toBe(expectedScale);
    },
  );

  it("adapts only after Adaptive mode is explicitly selected", () => {
    const governor = new PerformanceGovernor();
    governor.setMode("auto");

    for (let sample = 1; sample <= 40; sample += 1) {
      governor.update(45, sample * 20);
    }

    expect(governor.getScale()).toBeLessThan(0.85);
    governor.setMode("high");
    expect(governor.getScale()).toBe(1);
  });
});
