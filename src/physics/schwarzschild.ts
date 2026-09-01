export const SCHWARZSCHILD = Object.freeze({
  eventHorizonRs: 1,
  photonSphereRs: 1.5,
  iscoRs: 3,
  criticalImpactRs: (3 * Math.sqrt(3)) / 2,
  mu: 4 / 27,
});

export type Vec3 = readonly [number, number, number];
export type Vec4 = readonly [number, number, number, number];

export interface StaticObserver {
  readonly coordinates: Vec4;
  readonly position: Vec3;
  readonly fourVelocity: Vec4;
  readonly timeAxis: Vec3;
  readonly rightAxis: Vec3;
  readonly upAxis: Vec3;
  readonly outwardAxis: Vec3;
}

/**
 * Builds the orthonormal frame of a static Schwarzschild observer.
 * Distances are measured in Schwarzschild radii, r_s = 2GM/c².
 * Inclination is the usual astronomy convention: 0 is face-on to the disk.
 */
export function staticObserver(
  radiusRs: number,
  inclination: number,
  azimuth: number,
  coordinateTime = 0,
): StaticObserver {
  if (!(radiusRs > SCHWARZSCHILD.eventHorizonRs)) {
    throw new RangeError("A static observer must remain outside the event horizon.");
  }

  const sinTheta = Math.sin(inclination);
  const cosTheta = Math.cos(inclination);
  const sinPhi = Math.sin(azimuth);
  const cosPhi = Math.cos(azimuth);
  const lapse = Math.sqrt(1 - 1 / radiusRs);

  const radial: Vec3 = [sinTheta * cosPhi, sinTheta * sinPhi, cosTheta];
  const theta: Vec3 = [cosTheta * cosPhi, cosTheta * sinPhi, -sinTheta];
  const phi: Vec3 = [-sinPhi, cosPhi, 0];

  return {
    coordinates: [coordinateTime, radiusRs, inclination, azimuth],
    position: [radiusRs * radial[0], radiusRs * radial[1], radiusRs * radial[2]],
    fourVelocity: [1 / lapse, 0, 0, 0],
    timeAxis: [0, 0, 0],
    rightAxis: phi,
    upAxis: [-theta[0], -theta[1], -theta[2]],
    outwardAxis: [lapse * radial[0], lapse * radial[1], lapse * radial[2]],
  };
}

export function deflectionTextureU(energySquared: number): number {
  const mu = SCHWARZSCHILD.mu;
  if (energySquared < mu) {
    return 0.5 - Math.sqrt(-Math.log(1 - energySquared / mu) / 50);
  }
  return 0.5 + Math.sqrt(-Math.log(1 - mu / energySquared) / 50);
}

export function apsisInverseRadius(energySquared: number): number {
  const x = (2 / SCHWARZSCHILD.mu) * energySquared - 1;
  return 1 / 3 + (2 / 3) * Math.sin(Math.asin(x) / 3);
}

export function deflectionTextureV(energySquared: number, inverseRadius: number): number {
  if (energySquared > SCHWARZSCHILD.mu) {
    const offset =
      inverseRadius < 2 / 3
        ? -Math.sqrt(2 / 3 - inverseRadius)
        : Math.sqrt(inverseRadius - 2 / 3);
    return (Math.sqrt(2 / 3) + offset) / (Math.sqrt(2 / 3) + Math.sqrt(1 / 3));
  }
  return 1 - Math.sqrt(Math.max(1 - inverseRadius / apsisInverseRadius(energySquared), 0));
}
