export type QualityMode = "auto" | "performance" | "balanced" | "high";

export interface PerformanceSnapshot {
  readonly fps: number;
  readonly frameMs: number;
  readonly scale: number;
}

const FIXED_SCALE: Record<Exclude<QualityMode, "auto">, number> = {
  performance: 0.58,
  balanced: 0.78,
  high: 1,
};

export class PerformanceGovernor {
  private mode: QualityMode = "auto";
  private adaptiveScale = 0.85;
  private effectiveScale = 0.85;
  private frameEma = 16.7;
  private samples = 0;
  private lastAdjustment = 0;
  private interactiveUntil = 0;

  setMode(mode: QualityMode): void {
    this.mode = mode;
    this.samples = 0;
    this.recomputeScale(performance.now());
  }

  markInteraction(durationMs = 180): void {
    this.interactiveUntil = performance.now() + durationMs;
  }

  update(frameMs: number, now: number): PerformanceSnapshot {
    const clamped = Math.min(Math.max(frameMs, 1), 100);
    this.frameEma += (clamped - this.frameEma) * 0.08;
    this.samples += 1;

    if (this.mode === "auto" && this.samples > 30 && now - this.lastAdjustment > 700) {
      if (this.frameEma > 18.5) this.adaptiveScale = Math.max(0.52, this.adaptiveScale - 0.08);
      else if (this.frameEma < 14.2) this.adaptiveScale = Math.min(1, this.adaptiveScale + 0.04);
      this.lastAdjustment = now;
    }
    this.recomputeScale(now);

    return {
      fps: 1000 / this.frameEma,
      frameMs: this.frameEma,
      scale: this.effectiveScale,
    };
  }

  getScale(): number {
    return this.effectiveScale;
  }

  private recomputeScale(now: number): void {
    const requested = this.mode === "auto" ? this.adaptiveScale : FIXED_SCALE[this.mode];
    this.effectiveScale = now < this.interactiveUntil ? Math.min(requested, 0.64) : requested;
  }
}
