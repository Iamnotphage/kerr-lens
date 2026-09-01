import { describe, expect, it } from "vitest";

import {
  SCHWARZSCHILD,
  apsisInverseRadius,
  deflectionTextureU,
  deflectionTextureV,
  staticObserver,
  thinDiskTemperatureRatio,
} from "./schwarzschild";

const dot = (a: readonly number[], b: readonly number[]) =>
  a.reduce((sum, value, index) => sum + value * (b[index] ?? 0), 0);

describe("Schwarzschild analytic anchors", () => {
  it("uses the exact critical shadow radius", () => {
    expect(SCHWARZSCHILD.criticalImpactRs).toBeCloseTo(2.598076211, 9);
  });

  it("places the thin-disk temperature maximum at 49/12 r_s", () => {
    expect(thinDiskTemperatureRatio(49 / 12)).toBeCloseTo(1, 10);
    expect(thinDiskTemperatureRatio(SCHWARZSCHILD.iscoRs)).toBe(0);
    expect(thinDiskTemperatureRatio(12)).toBeLessThan(1);
  });
});

describe("static observer tetrad", () => {
  it("is mutually orthogonal and applies the Schwarzschild radial lapse", () => {
    const observer = staticObserver(16, Math.PI * 0.37, 1.2);
    expect(dot(observer.rightAxis, observer.upAxis)).toBeCloseTo(0, 12);
    expect(dot(observer.rightAxis, observer.outwardAxis)).toBeCloseTo(0, 12);
    expect(dot(observer.upAxis, observer.outwardAxis)).toBeCloseTo(0, 12);
    expect(Math.sqrt(dot(observer.rightAxis, observer.rightAxis))).toBeCloseTo(1, 12);
    expect(Math.sqrt(dot(observer.upAxis, observer.upAxis))).toBeCloseTo(1, 12);
    expect(Math.sqrt(dot(observer.outwardAxis, observer.outwardAxis))).toBeCloseTo(
      Math.sqrt(15 / 16),
      12,
    );
  });

  it("rejects a static observer at or inside the horizon", () => {
    expect(() => staticObserver(1, 0.5, 0)).toThrow(RangeError);
  });
});

describe("Bruneton lookup mappings", () => {
  it("maps either side of the critical energy to either side of the texture", () => {
    expect(deflectionTextureU(SCHWARZSCHILD.mu * 0.9)).toBeLessThan(0.5);
    expect(deflectionTextureU(SCHWARZSCHILD.mu * 1.1)).toBeGreaterThan(0.5);
  });

  it("maps the apsis to the top edge", () => {
    const energySquared = SCHWARZSCHILD.mu * 0.5;
    expect(deflectionTextureV(energySquared, apsisInverseRadius(energySquared))).toBeCloseTo(1, 12);
  });
});
