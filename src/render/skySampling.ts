/**
 * Caps hardware anisotropic filtering for the photographic sky. Strong
 * lensing can turn one screen pixel into a long, narrow footprint on the
 * panorama; isotropic mip selection then blurs across the short axis and
 * turns the Milky Way into broad artificial ribbons.
 */
export const SKY_ANISOTROPY_BUDGET = 8;

export function selectSkyAnisotropy(
  maxSupported: number,
  softwareRenderer = false,
): number {
  // SwiftShader implements anisotropy in software. Even a bounded setting can
  // dominate frame time there, while it is a native sampler path on a GPU.
  if (softwareRenderer) return 1;
  if (!Number.isFinite(maxSupported) || maxSupported < 1) return 1;
  return Math.min(SKY_ANISOTROPY_BUDGET, Math.floor(maxSupported));
}
