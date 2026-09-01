export interface FrameStatistics {
  readonly sampleCount: number;
  readonly medianMs: number;
  readonly p95Ms: number;
  readonly p99Ms: number;
  readonly meanMs: number;
  readonly minMs: number;
  readonly maxMs: number;
  readonly medianFps: number;
}

export interface FrameBenchmarkProgress {
  readonly phase: "warmup" | "sampling" | "complete";
  readonly warmupRemaining: number;
  readonly samplesRemaining: number;
  readonly statistics: FrameStatistics | null;
}

function percentile(sorted: readonly number[], fraction: number): number {
  if (sorted.length === 0) return 0;
  const position = (sorted.length - 1) * fraction;
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);
  const lower = sorted[lowerIndex] ?? 0;
  const upper = sorted[upperIndex] ?? lower;
  return lower + (upper - lower) * (position - lowerIndex);
}

export function summarizeFrames(samples: readonly number[]): FrameStatistics {
  if (samples.length === 0) {
    throw new RangeError("At least one frame sample is required.");
  }
  if (samples.some((sample) => !Number.isFinite(sample) || sample <= 0)) {
    throw new RangeError("Frame samples must be finite and positive.");
  }

  const sorted = [...samples].sort((left, right) => left - right);
  const meanMs = sorted.reduce((sum, sample) => sum + sample, 0) / sorted.length;
  const medianMs = percentile(sorted, 0.5);
  return {
    sampleCount: sorted.length,
    medianMs,
    p95Ms: percentile(sorted, 0.95),
    p99Ms: percentile(sorted, 0.99),
    meanMs,
    minMs: sorted[0] ?? 0,
    maxMs: sorted.at(-1) ?? 0,
    medianFps: 1000 / medianMs,
  };
}

/**
 * Deterministic fixed-length frame sampler used by the browser benchmark mode.
 * Warm-up frames are discarded so shader compilation and first uploads do not
 * contaminate the reported steady-state distribution.
 */
export class FrameBenchmark {
  private readonly initialWarmupFrames: number;
  private readonly targetSamples: number;
  private warmupRemaining: number;
  private samples: number[] = [];

  constructor(warmupFrames = 120, targetSamples = 600) {
    if (!Number.isInteger(warmupFrames) || warmupFrames < 0) {
      throw new RangeError("Warm-up frame count must be a non-negative integer.");
    }
    if (!Number.isInteger(targetSamples) || targetSamples < 1) {
      throw new RangeError("Target sample count must be a positive integer.");
    }
    this.initialWarmupFrames = warmupFrames;
    this.warmupRemaining = warmupFrames;
    this.targetSamples = targetSamples;
  }

  record(frameMs: number): FrameBenchmarkProgress {
    if (!Number.isFinite(frameMs) || frameMs <= 0) return this.progress();
    if (this.warmupRemaining > 0) {
      this.warmupRemaining -= 1;
    } else if (this.samples.length < this.targetSamples) {
      this.samples.push(frameMs);
    }
    return this.progress();
  }

  reset(): void {
    this.warmupRemaining = this.initialWarmupFrames;
    this.samples = [];
  }

  progress(): FrameBenchmarkProgress {
    const complete = this.samples.length === this.targetSamples;
    return {
      phase: this.warmupRemaining > 0 ? "warmup" : complete ? "complete" : "sampling",
      warmupRemaining: this.warmupRemaining,
      samplesRemaining: this.targetSamples - this.samples.length,
      statistics: complete ? summarizeFrames(this.samples) : null,
    };
  }
}
