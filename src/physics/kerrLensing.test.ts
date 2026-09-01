import { describe, expect, it } from "vitest";

import {
  kerrCriticalCurve,
  kerrPolarMinoAccelerationMu,
  kerrPolarPotentialMu,
  kerrPolarTurningCosineSquared,
  kerrRadialMinoAcceleration,
  kerrRadialPotential,
  kerrScreenConstants,
  kerrShadowProfile,
  schwarzschildShadowScreenRadius,
  sphericalPhotonConstants,
} from "./kerrLensing";

const FOV_Y = (48 * Math.PI) / 180;

describe("Kerr screen constants", () => {
  it("respects simultaneous spin and horizontal-screen reflection", () => {
    const positive = kerrScreenConstants(0.83, 26, 1.1, 0.31, -0.12, FOV_Y);
    const reflected = kerrScreenConstants(-0.83, 26, 1.1, -0.31, -0.12, FOV_Y);
    expect(reflected.lambda).toBeCloseTo(-positive.lambda, 12);
    expect(reflected.eta).toBeCloseTo(positive.eta, 12);
    expect(reflected.localEnergy).toBeCloseTo(positive.localEnergy, 12);
    expect(reflected.backwardMuVelocity).toBeCloseTo(positive.backwardMuVelocity, 12);
  });

  it("places the optical axis on a zero-angular-momentum Schwarzschild ray", () => {
    const constants = kerrScreenConstants(0, 26, 1.2, 0, 0, FOV_Y);
    expect(constants.lambda).toBe(0);
    expect(constants.eta).toBeCloseTo(0, 14);
    expect(constants.backwardMuVelocity).toBe(0);
  });

  it("initializes signed polar motion without a cancellation-prone square root", () => {
    const spin = 0.8;
    const inclination = (8 * Math.PI) / 180;
    const constants = kerrScreenConstants(spin, 26, inclination, 0.83, 1e-7, FOV_Y);
    const potential = kerrPolarPotentialMu(
      Math.cos(inclination),
      spin,
      constants.lambda,
      constants.eta,
    );
    expect(constants.backwardMuVelocity).toBeGreaterThan(0);
    expect(constants.backwardMuVelocity ** 2).toBeCloseTo(potential, 9);
  });
});

describe("spherical Kerr photon orbits", () => {
  it("satisfies both the radial potential and its double-root condition", () => {
    const spin = 0.9;
    const radiusM = 2.4;
    const { lambda, eta } = sphericalPhotonConstants(spin, radiusM);
    expect(kerrRadialPotential(radiusM, spin, lambda, eta)).toBeCloseTo(0, 10);
    const epsilon = 1e-5;
    const derivative =
      (kerrRadialPotential(radiusM + epsilon, spin, lambda, eta) -
        kerrRadialPotential(radiusM - epsilon, spin, lambda, eta)) /
      (2 * epsilon);
    expect(derivative).toBeCloseTo(0, 5);
    expect(kerrPolarPotentialMu(0, spin, lambda, eta)).toBe(eta);
  });

  it("uses the continuous Mino accelerations at radial and polar turning points", () => {
    const spin = 0.8;
    const lambda = -1.7;
    const eta = 8.2;
    const radiusM = 5.4;
    const cosineTheta = 0.37;
    const epsilon = 1e-5;
    const radialHalfDerivative =
      (kerrRadialPotential(radiusM + epsilon, spin, lambda, eta) -
        kerrRadialPotential(radiusM - epsilon, spin, lambda, eta)) /
      (4 * epsilon);
    const polarHalfDerivative =
      (kerrPolarPotentialMu(cosineTheta + epsilon, spin, lambda, eta) -
        kerrPolarPotentialMu(cosineTheta - epsilon, spin, lambda, eta)) /
      (4 * epsilon);
    expect(kerrRadialMinoAcceleration(radiusM, spin, lambda, eta)).toBeCloseTo(
      radialHalfDerivative,
      7,
    );
    expect(kerrPolarMinoAccelerationMu(cosineTheta, spin, lambda, eta)).toBeCloseTo(
      polarHalfDerivative,
      9,
    );
  });

  it("places the polar chart boundary on the exact Carter root", () => {
    const spin = 0.8;
    const lambda = -0.43;
    const eta = 1.72;
    const turningCosineSquared = kerrPolarTurningCosineSquared(spin, lambda, eta);
    expect(turningCosineSquared).toBeGreaterThan(0);
    expect(turningCosineSquared).toBeLessThan(1);
    expect(
      kerrPolarPotentialMu(Math.sqrt(turningCosineSquared), spin, lambda, eta),
    ).toBeCloseTo(0, 12);
  });
});

describe("finite-observer critical curve", () => {
  it("recovers the exact Schwarzschild local angular radius", () => {
    const radius = schwarzschildShadowScreenRadius(26, FOV_Y);
    const curve = kerrCriticalCurve(0, 26, 0.8, FOV_Y, 256);
    for (const point of curve.filter((_, index) => index % 31 === 0)) {
      expect(Math.hypot(point.x, point.y)).toBeCloseTo(radius, 12);
    }
  });

  it("mirrors the signed-spin critical curve without changing its size", () => {
    const positive = kerrShadowProfile(0.9, 26, 1.25, FOV_Y, 256);
    const negative = kerrShadowProfile(-0.9, 26, 1.25, FOV_Y, 256);
    expect(negative.centerX).toBeCloseTo(-positive.centerX, 9);
    expect(negative.centerY).toBeCloseTo(positive.centerY, 12);
    for (let index = 0; index < positive.radii.length; index += 17) {
      const mirroredIndex =
        (positive.radii.length / 2 - index - 1 + positive.radii.length) %
        positive.radii.length;
      expect(negative.radii[mirroredIndex]).toBeCloseTo(positive.radii[index] ?? 0, 4);
    }
  });

  it("displaces a high-inclination prograde shadow", () => {
    const profile = kerrShadowProfile(0.998, 26, (85 * Math.PI) / 180, FOV_Y);
    expect(Math.abs(profile.centerX)).toBeGreaterThan(0.01);
    expect(Math.min(...profile.radii)).toBeGreaterThan(0.1);
    expect(Math.max(...profile.radii)).toBeLessThan(0.35);
  });
});
