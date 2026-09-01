import { MAX_KERR_SPIN } from "./kerr";

const PI = Math.PI;
const TAU = 2 * PI;

export interface KerrScreenConstants {
  readonly lambda: number;
  readonly eta: number;
  readonly localEnergy: number;
}

export interface KerrCriticalPoint {
  readonly x: number;
  readonly y: number;
}

export interface KerrShadowProfile {
  readonly centerX: number;
  readonly centerY: number;
  readonly radii: Float32Array;
  readonly points: readonly KerrCriticalPoint[];
}

interface ZamoMetric {
  readonly radiusM: number;
  readonly sigma: number;
  readonly delta: number;
  readonly area: number;
  readonly lapse: number;
  readonly frameDragging: number;
  readonly sqrtGphiPhi: number;
}

function assertObserver(spin: number, radiusRs: number, inclination: number): void {
  if (!Number.isFinite(spin) || Math.abs(spin) > MAX_KERR_SPIN) {
    throw new RangeError(`Dimensionless Kerr spin must lie in [-${MAX_KERR_SPIN}, ${MAX_KERR_SPIN}].`);
  }
  if (!Number.isFinite(radiusRs) || radiusRs <= 1) {
    throw new RangeError("Observer radius must be finite and outside one Schwarzschild radius.");
  }
  if (!Number.isFinite(inclination) || inclination <= 0 || inclination >= PI) {
    throw new RangeError("Observer inclination must lie strictly between zero and pi.");
  }
}

function zamoMetric(spin: number, radiusRs: number, inclination: number): ZamoMetric {
  assertObserver(spin, radiusRs, inclination);
  const radiusM = 2 * radiusRs;
  const cosine = Math.cos(inclination);
  const sine = Math.sin(inclination);
  const sigma = radiusM * radiusM + spin * spin * cosine * cosine;
  const delta = radiusM * radiusM - 2 * radiusM + spin * spin;
  const area =
    (radiusM * radiusM + spin * spin) ** 2 -
    spin * spin * delta * sine * sine;
  return {
    radiusM,
    sigma,
    delta,
    area,
    lapse: Math.sqrt((sigma * delta) / area),
    frameDragging: (2 * spin * radiusM) / area,
    sqrtGphiPhi: sine * Math.sqrt(area / sigma),
  };
}

/**
 * Constants of motion for the future-directed photon that arrives along a
 * camera ray. The camera itself traces the same curve backward in time.
 */
export function kerrScreenConstants(
  spin: number,
  radiusRs: number,
  inclination: number,
  screenX: number,
  screenY: number,
  fovY: number,
): KerrScreenConstants {
  const metric = zamoMetric(spin, radiusRs, inclination);
  if (!Number.isFinite(screenX) || !Number.isFinite(screenY)) {
    throw new RangeError("Screen coordinates must be finite.");
  }
  if (!Number.isFinite(fovY) || fovY <= 0 || fovY >= PI) {
    throw new RangeError("Vertical field of view must lie strictly between zero and pi.");
  }

  const focalLength = 1 / Math.tan(fovY / 2);
  const inverseLength = 1 / Math.hypot(screenX, screenY, focalLength);
  // Backward camera direction is (x, y, -f). Reversing the complete null
  // vector gives the future photon seen by the ZAMO: (-x, -y, +f) in the
  // camera basis. Camera up is minus the Boyer-Lindquist theta direction.
  const futurePhi = -screenX * inverseLength;
  const futureTheta = screenY * inverseLength;
  const angularMomentum = futurePhi * metric.sqrtGphiPhi;
  const energy = metric.lapse + metric.frameDragging * angularMomentum;
  const lambda = angularMomentum === 0 ? 0 : angularMomentum / energy;
  const covariantThetaMomentum = futureTheta * Math.sqrt(metric.sigma);
  const cosine = Math.cos(inclination);
  const sine = Math.sin(inclination);
  const eta =
    (covariantThetaMomentum / energy) ** 2 +
    cosine * cosine * (lambda * lambda / (sine * sine) - spin * spin);
  return { lambda, eta, localEnergy: energy };
}

/** Carter radial polynomial R/E² in M = 1 Boyer-Lindquist units. */
export function kerrRadialPotential(
  radiusM: number,
  spin: number,
  lambda: number,
  eta: number,
): number {
  const delta = radiusM * radiusM - 2 * radiusM + spin * spin;
  const p = radiusM * radiusM + spin * spin - spin * lambda;
  return p * p - delta * ((lambda - spin) ** 2 + eta);
}

/** Carter polar polynomial (d cos(theta) / d gamma)². */
export function kerrPolarPotentialMu(
  cosineTheta: number,
  spin: number,
  lambda: number,
  eta: number,
): number {
  const cosineSquared = cosineTheta * cosineTheta;
  return (
    eta +
    (spin * spin - eta - lambda * lambda) * cosineSquared -
    spin * spin * cosineSquared * cosineSquared
  );
}

/** Constants for an unstable spherical Kerr photon orbit at radius r/M. */
export function sphericalPhotonConstants(
  spin: number,
  radiusM: number,
): { readonly lambda: number; readonly eta: number } {
  if (!Number.isFinite(spin) || Math.abs(spin) < 1e-8 || Math.abs(spin) > MAX_KERR_SPIN) {
    throw new RangeError("Spherical Kerr photon constants require non-zero physical spin.");
  }
  if (!Number.isFinite(radiusM) || radiusM <= 1) {
    throw new RangeError("Spherical photon radius must exceed one M.");
  }
  const radiusSquared = radiusM * radiusM;
  const lambda =
    (radiusSquared * (radiusM - 3) + spin * spin * (radiusM + 1)) /
    (spin * (1 - radiusM));
  const eta =
    (radiusM ** 3 * (4 * spin * spin - radiusM * (radiusM - 3) ** 2)) /
    (spin * spin * (radiusM - 1) ** 2);
  return { lambda, eta };
}

function equatorialPhotonRangeM(spinMagnitude: number): readonly [number, number] {
  const prograde = 2 * (1 + Math.cos((2 / 3) * Math.acos(-spinMagnitude)));
  const retrograde = 2 * (1 + Math.cos((2 / 3) * Math.acos(spinMagnitude)));
  return [prograde, retrograde];
}

/** Exact finite-observer Schwarzschild critical-circle radius in screen units. */
export function schwarzschildShadowScreenRadius(
  radiusRs: number,
  fovY: number,
): number {
  if (!Number.isFinite(radiusRs) || radiusRs <= 1) {
    throw new RangeError("Observer radius must be outside the Schwarzschild horizon.");
  }
  if (!Number.isFinite(fovY) || fovY <= 0 || fovY >= PI) {
    throw new RangeError("Vertical field of view must lie strictly between zero and pi.");
  }
  const radiusM = 2 * radiusRs;
  const criticalImpactM = 3 * Math.sqrt(3);
  const sine = (criticalImpactM * Math.sqrt(1 - 2 / radiusM)) / radiusM;
  const tangent = sine / Math.sqrt(Math.max(1 - sine * sine, 1e-12));
  return tangent / Math.tan(fovY / 2);
}

/**
 * Bardeen critical curve projected into a finite ZAMO camera. Spherical photon
 * constants are exact; the local projection includes finite observer radius.
 */
export function kerrCriticalCurve(
  spin: number,
  radiusRs: number,
  inclination: number,
  fovY: number,
  samples = 1024,
): readonly KerrCriticalPoint[] {
  assertObserver(spin, radiusRs, inclination);
  if (!Number.isInteger(samples) || samples < 64) {
    throw new RangeError("Critical curve requires at least 64 integer samples.");
  }
  const focalLength = 1 / Math.tan(fovY / 2);
  if (Math.abs(spin) < 1e-4) {
    const radius = schwarzschildShadowScreenRadius(radiusRs, fovY);
    return Array.from({ length: samples }, (_, index) => {
      const angle = (index / samples) * TAU;
      return { x: radius * Math.cos(angle), y: radius * Math.sin(angle) };
    });
  }

  const metric = zamoMetric(spin, radiusRs, inclination);
  const cosine = Math.cos(inclination);
  const sine = Math.sin(inclination);
  const [minimumRadius, maximumRadius] = equatorialPhotonRangeM(Math.abs(spin));
  const upper: KerrCriticalPoint[] = [];
  for (let index = 0; index <= samples; index += 1) {
    const fraction = index / samples;
    const radiusM = minimumRadius + (maximumRadius - minimumRadius) * fraction;
    const { lambda, eta } = sphericalPhotonConstants(spin, radiusM);
    const thetaPotential = eta + spin * spin * cosine * cosine -
      (lambda * lambda * cosine * cosine) / (sine * sine);
    const radialPotential = kerrRadialPotential(
      metric.radiusM,
      spin,
      lambda,
      eta,
    );
    const energyFactor = 1 - metric.frameDragging * lambda;
    if (thetaPotential < 0 || radialPotential <= 0 || energyFactor <= 0) continue;

    const localPhi =
      (metric.lapse * lambda) / (metric.sqrtGphiPhi * energyFactor);
    const localTheta =
      (metric.lapse * Math.sqrt(thetaPotential)) /
      (Math.sqrt(metric.sigma) * energyFactor);
    const localRadial =
      (metric.lapse * Math.sqrt(radialPotential)) /
      (Math.sqrt(metric.delta * metric.sigma) * energyFactor);
    if (!(localRadial > 0)) continue;
    upper.push({
      x: (-focalLength * localPhi) / localRadial,
      y: (focalLength * localTheta) / localRadial,
    });
  }

  if (upper.length < 8) {
    const radius = schwarzschildShadowScreenRadius(radiusRs, fovY);
    return Array.from({ length: samples }, (_, index) => {
      const angle = (index / samples) * TAU;
      return { x: radius * Math.cos(angle), y: radius * Math.sin(angle) };
    });
  }
  return [
    ...upper,
    ...upper
      .slice()
      .reverse()
      .map(({ x, y }) => ({ x, y: -y })),
  ];
}

function cross2(ax: number, ay: number, bx: number, by: number): number {
  return ax * by - ay * bx;
}

/** Polar boundary texture used to keep the critical curve sharp at full resolution. */
export function kerrShadowProfile(
  spin: number,
  radiusRs: number,
  inclination: number,
  fovY: number,
  radialSamples = 512,
): KerrShadowProfile {
  if (!Number.isInteger(radialSamples) || radialSamples < 64) {
    throw new RangeError("Shadow profile requires at least 64 integer samples.");
  }
  const points = kerrCriticalCurve(spin, radiusRs, inclination, fovY);
  let minimumX = Infinity;
  let maximumX = -Infinity;
  let minimumY = Infinity;
  let maximumY = -Infinity;
  for (const point of points) {
    minimumX = Math.min(minimumX, point.x);
    maximumX = Math.max(maximumX, point.x);
    minimumY = Math.min(minimumY, point.y);
    maximumY = Math.max(maximumY, point.y);
  }
  const centerX = (minimumX + maximumX) / 2;
  const centerY = (minimumY + maximumY) / 2;
  const fallbackRadius = (maximumX - minimumX + maximumY - minimumY) / 4;
  const radii = new Float32Array(radialSamples);

  for (let sample = 0; sample < radialSamples; sample += 1) {
    const angle = ((sample + 0.5) / radialSamples) * TAU - PI;
    const directionX = Math.cos(angle);
    const directionY = Math.sin(angle);
    let nearest = Infinity;
    for (let index = 0; index < points.length; index += 1) {
      const start = points[index];
      const end = points[(index + 1) % points.length];
      if (!start || !end) continue;
      const edgeX = end.x - start.x;
      const edgeY = end.y - start.y;
      const denominator = cross2(directionX, directionY, edgeX, edgeY);
      if (Math.abs(denominator) < 1e-12) continue;
      const relativeX = start.x - centerX;
      const relativeY = start.y - centerY;
      const distance = cross2(relativeX, relativeY, edgeX, edgeY) / denominator;
      const edgeFraction = cross2(relativeX, relativeY, directionX, directionY) / denominator;
      if (distance >= 0 && edgeFraction >= 0 && edgeFraction <= 1) {
        nearest = Math.min(nearest, distance);
      }
    }
    radii[sample] = Number.isFinite(nearest) ? nearest : fallbackRadius;
  }

  return { centerX, centerY, radii, points };
}
