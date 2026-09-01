import { SCHWARZSCHILD } from "./schwarzschild";

export const SI = Object.freeze({
  gravitationalConstant: 6.6743e-11,
  speedOfLight: 299_792_458,
  solarMass: 1.98847e30,
  protonMass: 1.67262192369e-27,
  thomsonCrossSection: 6.6524587321e-29,
  stefanBoltzmann: 5.670374419e-8,
  secondsPerJulianYear: 31_557_600,
});

/** Binding energy released at the Schwarzschild ISCO. */
export const SCHWARZSCHILD_RADIATIVE_EFFICIENCY = 1 - Math.sqrt(8 / 9);

/** Fixed scattering-atmosphere color correction used by the V1.2 surface model. */
export const DEFAULT_COLOR_CORRECTION = 1.7;

/** V1.2 visualizes the thermally dominant inner disk over this finite window. */
export const THERMAL_DISK_OUTER_RADIUS_RS = 12;

/** Numerically maximizes the exact Page–Thorne Schwarzschild surface flux. */
export const PAGE_THORNE_PEAK_RADIUS_RS = 4.7754566218;

function pageThorneIntegral(radiusM: number): number {
  const y = Math.sqrt(radiusM);
  const rootThree = Math.sqrt(3);
  const q = (value: number) =>
    value +
    (rootThree / 2) * Math.log((value + rootThree) / (value - rootThree));
  return q(y) - q(Math.sqrt(6));
}

/**
 * Dimensionless one-face Page–Thorne flux in Schwarzschild spacetime.
 *
 * The public radius uses r_s = 2GM/c² while the closed form uses x = R/(GM/c²).
 * The physical flux is
 *
 * F(R) = 3 c⁶ Ṁ / (8π G² M²) × pageThorneFluxShape(R / r_s).
 */
export function pageThorneFluxShape(radiusRs: number): number {
  if (radiusRs <= SCHWARZSCHILD.iscoRs) return 0;
  const radiusM = 2 * radiusRs;
  const integral = pageThorneIntegral(radiusM);
  return Math.max(integral / (radiusM ** 2.5 * (radiusM - 3)), 0);
}

export const PAGE_THORNE_PEAK_FLUX_SHAPE = pageThorneFluxShape(
  PAGE_THORNE_PEAK_RADIUS_RS,
);

/** Normalized effective-temperature profile, with a peak value of one. */
export function pageThorneTemperatureRatio(radiusRs: number): number {
  const flux = pageThorneFluxShape(radiusRs);
  return flux === 0 ? 0 : (flux / PAGE_THORNE_PEAK_FLUX_SHAPE) ** 0.25;
}

export interface ThermalDiskParameters {
  readonly massSolar: number;
  readonly eddingtonRatio: number;
  readonly eddingtonLuminosityW: number;
  readonly accretionRateKgPerSecond: number;
  readonly accretionRateSolarPerYear: number;
  readonly peakSurfaceFluxWPerSquareMeter: number;
  readonly peakEffectiveTemperatureK: number;
  readonly peakColorTemperatureK: number;
  readonly colorCorrection: number;
  readonly spectralDilution: number;
}

export function eddingtonLuminosity(massSolar: number): number {
  if (!Number.isFinite(massSolar) || massSolar <= 0) {
    throw new RangeError("Black-hole mass must be finite and positive.");
  }
  const massKg = massSolar * SI.solarMass;
  return (
    (4 * Math.PI * SI.gravitationalConstant * massKg * SI.protonMass * SI.speedOfLight) /
    SI.thomsonCrossSection
  );
}

/** Converts L/L_Edd to Ṁ using the zero-spin Novikov–Thorne efficiency. */
export function eddingtonAccretionRate(
  massSolar: number,
  eddingtonRatio: number,
): number {
  if (!Number.isFinite(eddingtonRatio) || eddingtonRatio <= 0) {
    throw new RangeError("Eddington ratio must be finite and positive.");
  }
  return (
    (eddingtonRatio * eddingtonLuminosity(massSolar)) /
    (SCHWARZSCHILD_RADIATIVE_EFFICIENCY * SI.speedOfLight ** 2)
  );
}

export function thermalDiskParameters(
  massSolar: number,
  eddingtonRatio: number,
  colorCorrection = DEFAULT_COLOR_CORRECTION,
): ThermalDiskParameters {
  if (!Number.isFinite(colorCorrection) || colorCorrection < 1) {
    throw new RangeError("Color correction must be finite and at least one.");
  }

  const massKg = massSolar * SI.solarMass;
  const eddingtonLuminosityW = eddingtonLuminosity(massSolar);
  const accretionRateKgPerSecond = eddingtonAccretionRate(massSolar, eddingtonRatio);
  const peakSurfaceFluxWPerSquareMeter =
    ((3 * SI.speedOfLight ** 6 * accretionRateKgPerSecond) /
      (8 * Math.PI * SI.gravitationalConstant ** 2 * massKg ** 2)) *
    PAGE_THORNE_PEAK_FLUX_SHAPE;
  const peakEffectiveTemperatureK =
    (peakSurfaceFluxWPerSquareMeter / SI.stefanBoltzmann) ** 0.25;

  return {
    massSolar,
    eddingtonRatio,
    eddingtonLuminosityW,
    accretionRateKgPerSecond,
    accretionRateSolarPerYear:
      (accretionRateKgPerSecond * SI.secondsPerJulianYear) / SI.solarMass,
    peakSurfaceFluxWPerSquareMeter,
    peakEffectiveTemperatureK,
    peakColorTemperatureK: colorCorrection * peakEffectiveTemperatureK,
    colorCorrection,
    spectralDilution: colorCorrection ** -4,
  };
}
