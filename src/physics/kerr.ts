import { SCHWARZSCHILD } from "./schwarzschild";

/** Conventional thin-disk cap below the numerically singular extremal limit. */
export const MAX_KERR_SPIN = 0.998;

export type DiskSpinSense = "prograde" | "schwarzschild" | "retrograde";

export interface KerrParameters {
  readonly spin: number;
  readonly diskSpinSense: DiskSpinSense;
  readonly outerHorizonRs: number;
  readonly innerHorizonRs: number;
  readonly equatorialStaticLimitRs: number;
  readonly equatorialErgosphereWidthRs: number;
  readonly diskPhotonOrbitRs: number;
  readonly diskIscoRs: number;
  readonly iscoSpecificEnergy: number;
  readonly radiativeEfficiency: number;
  readonly iscoAngularVelocityM: number;
  readonly horizonAngularVelocityM: number;
}

function assertSpin(spin: number): void {
  if (!Number.isFinite(spin) || Math.abs(spin) > MAX_KERR_SPIN) {
    throw new RangeError(`Dimensionless Kerr spin must lie in [-${MAX_KERR_SPIN}, ${MAX_KERR_SPIN}].`);
  }
}

/** Boyer–Lindquist outer horizon radius in Schwarzschild radii. */
export function outerHorizonRadiusRs(spin: number): number {
  assertSpin(spin);
  return (1 + Math.sqrt(1 - spin * spin)) / 2;
}

/** Boyer–Lindquist Cauchy-horizon radius in Schwarzschild radii. */
export function innerHorizonRadiusRs(spin: number): number {
  assertSpin(spin);
  return (1 - Math.sqrt(1 - spin * spin)) / 2;
}

/** Outer stationary-limit surface at Boyer–Lindquist colatitude theta. */
export function outerStaticLimitRadiusRs(spin: number, colatitude: number): number {
  assertSpin(spin);
  if (!Number.isFinite(colatitude) || colatitude < 0 || colatitude > Math.PI) {
    throw new RangeError("Colatitude must lie in [0, pi].");
  }
  const cosine = Math.cos(colatitude);
  return (1 + Math.sqrt(1 - spin * spin * cosine * cosine)) / 2;
}

/**
 * Equatorial circular photon orbit aligned with the disk's positive angular
 * momentum. Positive spin is prograde and negative spin is retrograde.
 */
export function diskPhotonOrbitRadiusRs(spin: number): number {
  assertSpin(spin);
  if (spin === 0) return SCHWARZSCHILD.photonSphereRs;
  return 1 + Math.cos((2 / 3) * Math.acos(-spin));
}

/**
 * Bardeen–Press–Teukolsky equatorial ISCO for a fixed positive disk orbit.
 * The public coordinate uses r_s = 2M, so the standard M-unit result is halved.
 */
export function diskIscoRadiusRs(spin: number): number {
  assertSpin(spin);
  if (spin === 0) return SCHWARZSCHILD.iscoRs;
  const z1 =
    1 +
    Math.cbrt(1 - spin * spin) *
      (Math.cbrt(1 + spin) + Math.cbrt(1 - spin));
  const z2 = Math.sqrt(3 * spin * spin + z1 * z1);
  const radical = Math.sqrt((3 - z1) * (3 + z1 + 2 * z2));
  return (3 + z2 - Math.sign(spin) * radical) / 2;
}

/** Specific energy of a positive-sense circular equatorial orbit. */
export function circularOrbitSpecificEnergy(spin: number, radiusRs: number): number {
  assertSpin(spin);
  if (!Number.isFinite(radiusRs) || radiusRs <= outerHorizonRadiusRs(spin)) {
    throw new RangeError("Circular-orbit radius must be finite and outside the outer horizon.");
  }
  const radiusM = 2 * radiusRs;
  const squareRootRadius = Math.sqrt(radiusM);
  const radiusToThreeHalves = radiusM * squareRootRadius;
  const radialFactor = radiusToThreeHalves - 3 * squareRootRadius + 2 * spin;
  if (radialFactor <= 0) {
    throw new RangeError("No positive-sense timelike circular orbit exists at this radius.");
  }
  return (
    (radiusToThreeHalves - 2 * squareRootRadius + spin) /
    (radiusM ** 0.75 * Math.sqrt(radialFactor))
  );
}

export function iscoSpecificEnergy(spin: number): number {
  assertSpin(spin);
  if (spin === 0) return Math.sqrt(8 / 9);
  return circularOrbitSpecificEnergy(spin, diskIscoRadiusRs(spin));
}

/** Zero-torque Novikov–Thorne efficiency, eta = 1 - E_ISCO. */
export function kerrRadiativeEfficiency(spin: number): number {
  return 1 - iscoSpecificEnergy(spin);
}

/** Circular-orbit angular velocity Omega M in geometrized units. */
export function circularOrbitAngularVelocityM(spin: number, radiusRs: number): number {
  assertSpin(spin);
  if (!Number.isFinite(radiusRs) || radiusRs <= outerHorizonRadiusRs(spin)) {
    throw new RangeError("Circular-orbit radius must be finite and outside the outer horizon.");
  }
  return 1 / ((2 * radiusRs) ** 1.5 + spin);
}

/** Event-horizon angular velocity Omega_H M in geometrized units. */
export function horizonAngularVelocityM(spin: number): number {
  assertSpin(spin);
  const outerHorizonM = 2 * outerHorizonRadiusRs(spin);
  return spin / (2 * outerHorizonM);
}

export function kerrParameters(spin: number): KerrParameters {
  assertSpin(spin);
  const outerHorizonRs = outerHorizonRadiusRs(spin);
  const diskIscoRs = diskIscoRadiusRs(spin);
  const iscoEnergy = iscoSpecificEnergy(spin);
  const equatorialStaticLimitRs = outerStaticLimitRadiusRs(spin, Math.PI / 2);
  return {
    spin,
    diskSpinSense: spin > 0 ? "prograde" : spin < 0 ? "retrograde" : "schwarzschild",
    outerHorizonRs,
    innerHorizonRs: innerHorizonRadiusRs(spin),
    equatorialStaticLimitRs,
    equatorialErgosphereWidthRs: equatorialStaticLimitRs - outerHorizonRs,
    diskPhotonOrbitRs: diskPhotonOrbitRadiusRs(spin),
    diskIscoRs,
    iscoSpecificEnergy: iscoEnergy,
    radiativeEfficiency: 1 - iscoEnergy,
    iscoAngularVelocityM: circularOrbitAngularVelocityM(spin, diskIscoRs),
    horizonAngularVelocityM: horizonAngularVelocityM(spin),
  };
}
