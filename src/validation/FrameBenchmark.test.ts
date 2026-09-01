import { describe, expect, it } from "vitest";

import { FrameBenchmark, summarizeFrames } from "./FrameBenchmark";

describe("frame benchmark statistics", () => {
  it("reports interpolated median, p95 and p99 frame times", () => {
    const samples = Array.from({ length: 100 }, (_, index) => index + 1);
    const result = summarizeFrames(samples);
    expect(result.sampleCount).toBe(100);
    expect(result.medianMs).toBeCloseTo(50.5, 12);
    expect(result.p95Ms).toBeCloseTo(95.05, 12);
    expect(result.p99Ms).toBeCloseTo(99.01, 12);
    expect(result.meanMs).toBeCloseTo(50.5, 12);
    expect(result.medianFps).toBeCloseTo(1000 / 50.5, 12);
  });

  it("discards warm-up frames and stops at the requested sample count", () => {
    const benchmark = new FrameBenchmark(2, 3);
    benchmark.record(90);
    benchmark.record(80);
    benchmark.record(10);
    benchmark.record(20);
    const progress = benchmark.record(30);
    expect(progress.phase).toBe("complete");
    expect(progress.statistics?.sampleCount).toBe(3);
    expect(progress.statistics?.medianMs).toBe(20);
    expect(benchmark.record(1).statistics?.medianMs).toBe(20);
  });

  it("rejects invalid configurations and samples", () => {
    expect(() => new FrameBenchmark(-1, 10)).toThrow(RangeError);
    expect(() => new FrameBenchmark(1, 0)).toThrow(RangeError);
    expect(() => summarizeFrames([])).toThrow(RangeError);
    expect(() => summarizeFrames([16, Number.NaN])).toThrow(RangeError);
  });
});
