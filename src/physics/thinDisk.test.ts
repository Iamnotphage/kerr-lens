import { describe, expect, it } from "vitest";

import {
  DEFAULT_COLOR_CORRECTION,
  PAGE_THORNE_PEAK_FLUX_SHAPE,
  PAGE_THORNE_PEAK_RADIUS_RS,
  SCHWARZSCHILD_RADIATIVE_EFFICIENCY,
  eddingtonLuminosity,
  pageThorneFluxShape,
  pageThorneTemperatureRatio,
  thermalDiskParameters,
} from "./thinDisk";

describe("Page–Thorne Schwarzschild disk", () => {
  it("uses the zero-torque ISCO boundary and relativistic flux maximum", () => {
    expect(pageThorneFluxShape(3)).toBe(0);
    expect(PAGE_THORNE_PEAK_RADIUS_RS).toBeCloseTo(4.775456622, 9);
    expect(PAGE_THORNE_PEAK_FLUX_SHAPE).toBeCloseTo(0.0001145894732, 12);
    expect(pageThorneTemperatureRatio(PAGE_THORNE_PEAK_RADIUS_RS)).toBeCloseTo(1, 12);
    expect(pageThorneTemperatureRatio(4)).toBeCloseTo(0.956469331, 8);
    expect(pageThorneTemperatureRatio(12)).toBeCloseTo(0.692643164, 8);
  });

  it("recovers the Newtonian r^-3 flux at large radius", () => {
    const radiusM = 1_000_000;
    const scaledFlux = pageThorneFluxShape(radiusM / 2) * radiusM ** 3;
    expect(scaledFlux).toBeGreaterThan(0.99);
    expect(scaledFlux).toBeLessThan(1);
  });

  it("uses the exact Schwarzschild ISCO efficiency", () => {
    expect(SCHWARZSCHILD_RADIATIVE_EFFICIENCY).toBeCloseTo(0.05719095842, 11);
  });
});

describe("physical thermal scale", () => {
  it("derives luminosity, accretion rate and both peak temperatures", () => {
    const disk = thermalDiskParameters(1e9, 0.01);
    expect(eddingtonLuminosity(1e9) / 1e40).toBeCloseTo(1.2571, 4);
    expect(disk.peakEffectiveTemperatureK).toBeGreaterThan(22_000);
    expect(disk.peakEffectiveTemperatureK).toBeLessThan(22_500);
    expect(disk.peakColorTemperatureK).toBeCloseTo(
      disk.peakEffectiveTemperatureK * DEFAULT_COLOR_CORRECTION,
      8,
    );
    expect(disk.spectralDilution).toBeCloseTo(DEFAULT_COLOR_CORRECTION ** -4, 12);
  });

  it("obeys T_peak proportional to (Eddington ratio / mass)^1/4", () => {
    const reference = thermalDiskParameters(1e8, 0.01).peakEffectiveTemperatureK;
    expect(thermalDiskParameters(16e8, 0.01).peakEffectiveTemperatureK).toBeCloseTo(
      reference / 2,
      8,
    );
    expect(thermalDiskParameters(1e8, 0.16).peakEffectiveTemperatureK).toBeCloseTo(
      reference * 2,
      8,
    );
  });

  it("rejects nonphysical inputs", () => {
    expect(() => thermalDiskParameters(0, 0.1)).toThrow(RangeError);
    expect(() => thermalDiskParameters(1e8, 0)).toThrow(RangeError);
    expect(() => thermalDiskParameters(1e8, 0.1, 0.9)).toThrow(RangeError);
  });
});
