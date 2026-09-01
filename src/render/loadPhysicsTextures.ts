import {
  ClampToEdgeWrapping,
  DataTexture,
  FloatType,
  LinearFilter,
  LinearMipmapLinearFilter,
  LoadingManager,
  NoColorSpace,
  RGBAFormat,
  RedFormat,
  RGFormat,
  RepeatWrapping,
  SRGBColorSpace,
  Texture,
  TextureLoader,
} from "three";

import {
  THERMAL_DISK_OUTER_RADIUS_RS,
  pageThorneTemperatureRatio,
} from "../physics/thinDisk";

export interface PhysicsTextures {
  readonly deflection: DataTexture;
  readonly inverseRadius: DataTexture;
  readonly blackBody: DataTexture;
  readonly diskTemperature: DataTexture;
  readonly noise: Texture;
  readonly sky: Texture;
}

function diskTemperatureTexture(): DataTexture {
  const width = 256;
  const data = new Float32Array(width);
  for (let index = 0; index < width; index += 1) {
    const radius =
      3 + (index / (width - 1)) * (THERMAL_DISK_OUTER_RADIUS_RS - 3);
    data[index] = pageThorneTemperatureRatio(radius);
  }

  const texture = new DataTexture(data, width, 1, RedFormat, FloatType);
  texture.name = "Page–Thorne temperature profile";
  texture.colorSpace = NoColorSpace;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

async function fetchBuffer(url: string, onFraction: (fraction: number) => void): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to load ${url}: HTTP ${response.status}`);

  const total = Number(response.headers.get("content-length")) || 0;
  if (!response.body || total === 0) {
    const buffer = await response.arrayBuffer();
    onFraction(1);
    return buffer;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.byteLength;
    onFraction(Math.min(received / total, 1));
  }

  const merged = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return merged.buffer;
}

function lookupTexture(buffer: ArrayBuffer, label: string): DataTexture {
  const view = new DataView(buffer);
  const width = view.getFloat32(0, true);
  const height = view.getFloat32(4, true);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new Error(`${label} has an invalid texture header.`);
  }

  const data = new Float32Array(buffer, 8);
  if (data.length !== width * height * 2) {
    throw new Error(`${label} has ${data.length} values; expected ${width * height * 2}.`);
  }

  const texture = new DataTexture(data, width, height, RGFormat, FloatType);
  texture.name = label;
  texture.colorSpace = NoColorSpace;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

function blackBodyTexture(buffer: ArrayBuffer): DataTexture {
  const source = new Float32Array(buffer);
  if (source.length !== 128 * 3) throw new Error("Black-body lookup table has an invalid size.");
  const rgba = new Float32Array(128 * 4);
  for (let i = 0; i < 128; i += 1) {
    const sourceOffset = i * 3;
    const targetOffset = i * 4;
    rgba[targetOffset] = source[sourceOffset] ?? 0;
    rgba[targetOffset + 1] = source[sourceOffset + 1] ?? 0;
    rgba[targetOffset + 2] = source[sourceOffset + 2] ?? 0;
    rgba[targetOffset + 3] = 1;
  }
  const texture = new DataTexture(rgba, 128, 1, RGBAFormat, FloatType);
  texture.name = "CIE black-body radiance";
  texture.colorSpace = NoColorSpace;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

export async function loadPhysicsTextures(
  onProgress: (fraction: number) => void,
): Promise<PhysicsTextures> {
  const base = `${import.meta.env.BASE_URL}assets`;
  const weights = [0.82, 0.02, 0.01, 0.05, 0.1] as const;
  const progress = [0, 0, 0, 0, 0];
  const update = (index: number, fraction: number) => {
    progress[index] = fraction;
    onProgress(progress.reduce((sum, item, itemIndex) => sum + item * (weights[itemIndex] ?? 0), 0));
  };

  const loadingManager = new LoadingManager();
  const textureLoader = new TextureLoader(loadingManager);
  const [deflectionData, inverseData, blackBodyData, noise, sky] = await Promise.all([
    fetchBuffer(`${base}/deflection.dat`, (value) => update(0, value)),
    fetchBuffer(`${base}/inverse_radius.dat`, (value) => update(1, value)),
    fetchBuffer(`${base}/black_body.dat`, (value) => update(2, value)),
    textureLoader.loadAsync(`${base}/noise_texture.png`).then((texture) => {
      update(3, 1);
      return texture;
    }),
    textureLoader.loadAsync(`${base}/milky-way.webp`).then((texture) => {
      update(4, 1);
      return texture;
    }),
  ]);

  noise.name = "Accretion flow noise";
  noise.colorSpace = NoColorSpace;
  noise.wrapS = RepeatWrapping;
  noise.wrapT = RepeatWrapping;
  noise.minFilter = LinearFilter;
  noise.magFilter = LinearFilter;
  noise.generateMipmaps = true;
  noise.needsUpdate = true;

  sky.name = "ESO Milky Way panorama";
  sky.colorSpace = SRGBColorSpace;
  sky.wrapS = RepeatWrapping;
  sky.wrapT = ClampToEdgeWrapping;
  sky.minFilter = LinearMipmapLinearFilter;
  sky.magFilter = LinearFilter;
  sky.generateMipmaps = true;
  sky.needsUpdate = true;

  onProgress(1);
  return {
    deflection: lookupTexture(deflectionData, "Schwarzschild ray deflection"),
    inverseRadius: lookupTexture(inverseData, "Schwarzschild inverse radius"),
    blackBody: blackBodyTexture(blackBodyData),
    diskTemperature: diskTemperatureTexture(),
    noise,
    sky,
  };
}
