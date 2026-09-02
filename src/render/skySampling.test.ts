import { describe, expect, it } from "vitest";

import fragmentShader from "../shaders/black-hole.frag.glsl?raw";
import {
  selectSkyAnisotropy,
  SKY_ANISOTROPY_BUDGET,
} from "./skySampling";

describe("lensed sky sampling", () => {
  it("uses the supported anisotropic footprint up to the frame-time budget", () => {
    expect(selectSkyAnisotropy(16)).toBe(SKY_ANISOTROPY_BUDGET);
    expect(selectSkyAnisotropy(4)).toBe(4);
    expect(selectSkyAnisotropy(1)).toBe(1);
  });

  it("falls back to ordinary mip filtering when the extension is unavailable", () => {
    expect(selectSkyAnisotropy(0)).toBe(1);
    expect(selectSkyAnisotropy(Number.NaN)).toBe(1);
  });

  it("does not emulate anisotropy on a software renderer", () => {
    expect(selectSkyAnisotropy(16, true)).toBe(1);
  });

  it("unwraps equirectangular derivatives before selecting a sky mip", () => {
    expect(fragmentShader).toContain("skyDx.x -= round(skyDx.x);");
    expect(fragmentShader).toContain("skyDy.x -= round(skyDy.x);");
    expect(fragmentShader).toContain("textureGrad(uSkyTexture, uv, skyDx, skyDy)");
  });
});
