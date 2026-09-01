import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const expected = {
  "public/assets/deflection.dat": "1080f45a12fba81321771c2071f4a31795444b110833f61384a9bdf7d057c19d",
  "public/assets/inverse_radius.dat": "7fa22a9270e61f2842c97fb1a9398bcb13e1a965ad39b0f73169354a0d608b04",
  "public/assets/black_body.dat": "aac8ed78dde66d9b44da8b65142429470c89b5edeb74a8fde8dfc000777a2d97",
  "public/assets/noise_texture.png": "7ba6d84ad14496b6299b57dbbc75b400fad4e9ab022dcacfc7f3fa3751009ed9",
};

// Catch accidental changes to scientific inputs before they reach the GPU.
for (const [path, digest] of Object.entries(expected)) {
  const actual = createHash("sha256").update(readFileSync(path)).digest("hex");
  if (actual !== digest) throw new Error(`${path}: expected ${digest}, received ${actual}`);
}

const deflection = readFileSync("public/assets/deflection.dat");
const inverseRadius = readFileSync("public/assets/inverse_radius.dat");
if (deflection.readFloatLE(0) !== 512 || deflection.readFloatLE(4) !== 512) {
  throw new Error("deflection.dat must be a 512×512 RG32F table");
}
if (inverseRadius.readFloatLE(0) !== 64 || inverseRadius.readFloatLE(4) !== 32) {
  throw new Error("inverse_radius.dat must be a 64×32 RG32F table");
}

console.log(`Verified ${Object.keys(expected).length} physics assets.`);
