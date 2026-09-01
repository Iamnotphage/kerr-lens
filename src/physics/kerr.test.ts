import { describe, expect, it } from "vitest";

import { SCHWARZSCHILD } from "./schwarzschild";
import { SCHWARZSCHILD_RADIATIVE_EFFICIENCY } from "./thinDisk";
import {
  MAX_KERR_SPIN,
  circularOrbitAngularVelocityM,
  circularOrbitSpecificEnergy,
  diskIscoRadiusRs,
  diskPhotonOrbitRadiusRs,
  horizonAngularVelocityM,
  innerHorizonRadiusRs,
  iscoSpecificEnergy,
  kerrParameters,
  kerrRadiativeEfficiency,
  outerHorizonRadiusRs,
  outerStaticLimitRadiusRs,
} from "./kerr";

describe("Kerr Schwarzschild limit", () => {
  it("regresses exactly to every shared zero-spin radius", () => {
    expect(outerHorizonRadiusRs(0)).toBe(SCHWARZSCHILD.eventHorizonRs);
    expect(innerHorizonRadiusRs(0)).toBe(0);
    expect(diskPhotonOrbitRadiusRs(0)).toBe(SCHWARZSCHILD.photonSphereRs);
    expect(diskIscoRadiusRs(0)).toBe(SCHWARZSCHILD.iscoRs);
    expect(kerrRadiativeEfficiency(0)).toBe(SCHWARZSCHILD_RADIATIVE_EFFICIENCY);
    expect(horizonAngularVelocityM(0)).toBe(0);
  });

  it("recovers the Schwarzschild circular-orbit energy and frequency", () => {
    expect(iscoSpecificEnergy(0)).toBeCloseTo(Math.sqrt(8 / 9), 14);
    expect(circularOrbitSpecificEnergy(0, 3)).toBeCloseTo(Math.sqrt(8 / 9), 14);
    expect(circularOrbitAngularVelocityM(0, 3)).toBeCloseTo(1 / 6 ** 1.5, 14);
  });
});

describe("Kerr horizons and ergosphere", () => {
  it("keeps horizons even in spin and the equatorial static limit at one r_s", () => {
    for (const spin of [0.2, 0.7, MAX_KERR_SPIN]) {
      expect(outerHorizonRadiusRs(spin)).toBeCloseTo(outerHorizonRadiusRs(-spin), 14);
      expect(innerHorizonRadiusRs(spin)).toBeCloseTo(innerHorizonRadiusRs(-spin), 14);
      expect(outerStaticLimitRadiusRs(spin, Math.PI / 2)).toBeCloseTo(1, 14);
      expect(outerStaticLimitRadiusRs(spin, 0)).toBeCloseTo(
        outerHorizonRadiusRs(spin),
        14,
      );
    }
  });

  it("uses the Thorne spin cap", () => {
    expect(outerHorizonRadiusRs(MAX_KERR_SPIN)).toBeCloseTo(0.5316069613, 9);
    expect(() => outerHorizonRadiusRs(1)).toThrow(RangeError);
    expect(() => outerStaticLimitRadiusRs(0.5, -0.1)).toThrow(RangeError);
  });
});

describe("equatorial Kerr orbit anchors", () => {
  it("moves the disk-aligned photon orbit and ISCO inward for prograde spin", () => {
    expect(diskPhotonOrbitRadiusRs(MAX_KERR_SPIN)).toBeCloseTo(0.5369546288, 9);
    expect(diskIscoRadiusRs(MAX_KERR_SPIN)).toBeCloseTo(0.6184853276, 9);
    expect(kerrRadiativeEfficiency(MAX_KERR_SPIN)).toBeCloseTo(0.3209941656, 9);
  });

  it("moves the same orbits outward for retrograde spin", () => {
    expect(diskPhotonOrbitRadiusRs(-MAX_KERR_SPIN)).toBeCloseTo(1.9991109464, 9);
    expect(diskIscoRadiusRs(-MAX_KERR_SPIN)).toBeCloseTo(4.4971872274, 9);
    expect(kerrRadiativeEfficiency(-MAX_KERR_SPIN)).toBeCloseTo(0.037773625, 8);
  });

  it("returns a self-consistent parameter snapshot", () => {
    const parameters = kerrParameters(0.9);
    expect(parameters.diskSpinSense).toBe("prograde");
    expect(parameters.equatorialErgosphereWidthRs).toBeCloseTo(
      1 - parameters.outerHorizonRs,
      14,
    );
    expect(parameters.iscoSpecificEnergy + parameters.radiativeEfficiency).toBeCloseTo(1, 14);
    expect(parameters.iscoAngularVelocityM).toBeGreaterThan(0);
    expect(parameters.horizonAngularVelocityM).toBe(horizonAngularVelocityM(0.9));
    expect(kerrParameters(-0.9).diskSpinSense).toBe("retrograde");
  });
});
