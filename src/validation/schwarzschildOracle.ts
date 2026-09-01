import { SCHWARZSCHILD } from "../physics/schwarzschild";

/** Independent bisection solution of the ray's outer radial turning point. */
export function scatteringTurningPoint(impactParameterRs: number): number {
  if (
    !Number.isFinite(impactParameterRs) ||
    impactParameterRs <= SCHWARZSCHILD.criticalImpactRs
  ) {
    throw new RangeError("A scattering ray must lie outside the critical impact parameter.");
  }

  const energySquared = 1 / impactParameterRs ** 2;
  let lower = 0;
  let upper = 2 / 3;
  for (let iteration = 0; iteration < 96; iteration += 1) {
    const midpoint = (lower + upper) * 0.5;
    const radialPotential = energySquared - midpoint ** 2 * (1 - midpoint);
    if (radialPotential > 0) lower = midpoint;
    else upper = midpoint;
  }
  return (lower + upper) * 0.5;
}

/**
 * High-precision CPU oracle for a Schwarzschild scattering ray from infinity.
 *
 * With u = 1/r and e = 1/b, the half-orbit is
 * integral du / sqrt(e² - u²(1-u)). The substitution
 * u = u_apsis(1-s²) removes the square-root endpoint singularity before an
 * even-subdivision Simpson integration.
 */
export function scatteringHalfOrbit(
  impactParameterRs: number,
  subdivisions = 32_768,
): number {
  if (!Number.isInteger(subdivisions) || subdivisions < 32 || subdivisions % 2 !== 0) {
    throw new RangeError("Simpson subdivisions must be an even integer of at least 32.");
  }

  const energySquared = 1 / impactParameterRs ** 2;
  const apsis = scatteringTurningPoint(impactParameterRs);
  const potentialDerivative = apsis * (3 * apsis - 2);
  const integrand = (s: number): number => {
    if (s === 0) return (2 * apsis) / Math.sqrt(-potentialDerivative * apsis);
    const inverseRadius = apsis * (1 - s * s);
    const radialPotential =
      energySquared - inverseRadius ** 2 * (1 - inverseRadius);
    return (2 * apsis * s) / Math.sqrt(Math.max(radialPotential, Number.MIN_VALUE));
  };

  let weightedSum = integrand(0) + integrand(1);
  for (let index = 1; index < subdivisions; index += 1) {
    weightedSum += (index % 2 === 0 ? 2 : 4) * integrand(index / subdivisions);
  }
  return weightedSum / (3 * subdivisions);
}

export function scatteringDeflection(
  impactParameterRs: number,
  subdivisions = 32_768,
): number {
  return 2 * scatteringHalfOrbit(impactParameterRs, subdivisions) - Math.PI;
}

/** First two post-Minkowskian terms, expressed in r_s units. */
export function weakFieldDeflection(impactParameterRs: number): number {
  if (!Number.isFinite(impactParameterRs) || impactParameterRs <= 0) {
    throw new RangeError("Impact parameter must be finite and positive.");
  }
  return 2 / impactParameterRs + (15 * Math.PI) / (16 * impactParameterRs ** 2);
}
