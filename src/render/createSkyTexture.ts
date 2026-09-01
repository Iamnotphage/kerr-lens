import {
  ClampToEdgeWrapping,
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  NoColorSpace,
  RGBAFormat,
  RepeatWrapping,
  UnsignedByteType,
} from "three";

function mulberry32(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(x: number, y: number): number {
  let value = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  value = (value ^ (value >>> 13)) * 1274126177;
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
}

function addPixel(
  data: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number,
  color: readonly [number, number, number],
  strength: number,
): void {
  const wrappedX = ((x % width) + width) % width;
  if (y < 0 || y >= height) return;
  const offset = (wrappedX + y * width) * 4;
  for (let channel = 0; channel < 3; channel += 1) {
    data[offset + channel] = Math.min(
      255,
      (data[offset + channel] ?? 0) + Math.round((color[channel] ?? 0) * strength),
    );
  }
}

/** Generates a deterministic, lightweight sky texture. Star positions are presentational. */
export function createSkyTexture(width = 1024, height = 512): DataTexture {
  const data = new Uint8Array(width * height * 4);
  const galacticNormal = [0.22, 0.84, 0.495] as const;

  for (let y = 0; y < height; y += 1) {
    const latitude = ((y + 0.5) / height - 0.5) * Math.PI;
    const cosLatitude = Math.cos(latitude);
    const sinLatitude = Math.sin(latitude);
    for (let x = 0; x < width; x += 1) {
      const longitude = ((x + 0.5) / width - 0.5) * Math.PI * 2;
      const direction = [
        cosLatitude * Math.cos(longitude),
        sinLatitude,
        cosLatitude * Math.sin(longitude),
      ] as const;
      const planeDistance = Math.abs(
        direction[0] * galacticNormal[0] +
          direction[1] * galacticNormal[1] +
          direction[2] * galacticNormal[2],
      );
      const band = Math.exp(-planeDistance * planeDistance * 115);
      const dust = 0.58 + 0.42 * hash(x >> 3, y >> 3);
      const glow = band * dust;
      const offset = (x + y * width) * 4;
      data[offset] = Math.round(2 + glow * 12);
      data[offset + 1] = Math.round(4 + glow * 15);
      data[offset + 2] = Math.round(9 + glow * 23);
      data[offset + 3] = 255;
    }
  }

  const random = mulberry32(0x4b455252);
  const starColors = [
    [255, 223, 190],
    [210, 226, 255],
    [255, 246, 224],
    [255, 190, 155],
  ] as const;

  for (let i = 0; i < 6200; i += 1) {
    const u = random();
    const sinLatitude = random() * 2 - 1;
    const v = Math.asin(sinLatitude) / Math.PI + 0.5;
    const x = Math.floor(u * width);
    const y = Math.floor(v * height);
    const magnitude = Math.pow(random(), 9);
    const strength = 0.16 + magnitude * 1.35;
    const color = starColors[Math.min(starColors.length - 1, Math.floor(random() * starColors.length))] ?? starColors[0];
    addPixel(data, width, height, x, y, color, strength);
    if (magnitude > 0.72) {
      const halo = strength * 0.24;
      addPixel(data, width, height, x - 1, y, color, halo);
      addPixel(data, width, height, x + 1, y, color, halo);
      addPixel(data, width, height, x, y - 1, color, halo);
      addPixel(data, width, height, x, y + 1, color, halo);
    }
  }

  const texture = new DataTexture(data, width, height, RGBAFormat, UnsignedByteType);
  texture.name = "Procedural celestial sphere";
  texture.colorSpace = NoColorSpace;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.magFilter = LinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}
