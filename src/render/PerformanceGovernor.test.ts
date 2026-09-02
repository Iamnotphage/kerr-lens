import { afterEach, describe, expect, it, vi } from "vitest";

import { PerformanceGovernor } from "./PerformanceGovernor";

describe("PerformanceGovernor interaction fallback", () => {
  afterEach(() => vi.restoreAllMocks());

  it("keeps the selected quality during interaction by default", () => {
    vi.spyOn(performance, "now").mockReturnValue(1_000);
    const governor = new PerformanceGovernor();
    governor.setMode("high");

    governor.markInteraction();

    expect(governor.update(16.7, 1_010).scale).toBe(1);
  });

  it("only lowers interaction scale after explicit opt-in", () => {
    vi.spyOn(performance, "now").mockReturnValue(1_000);
    const governor = new PerformanceGovernor();
    governor.setMode("high");
    governor.setInteractionFallbackEnabled(true);

    governor.markInteraction(180);

    expect(governor.update(16.7, 1_010).scale).toBe(0.64);
    expect(governor.update(16.7, 1_181).scale).toBe(1);
  });

  it("restores the selected quality immediately when disabled", () => {
    vi.spyOn(performance, "now").mockReturnValue(1_000);
    const governor = new PerformanceGovernor();
    governor.setMode("balanced");
    governor.setInteractionFallbackEnabled(true);
    governor.markInteraction();
    expect(governor.update(16.7, 1_010).scale).toBe(0.64);

    governor.setInteractionFallbackEnabled(false);

    expect(governor.getScale()).toBe(0.78);
  });
});
