import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { SCHWARZSCHILD, deflectionTextureU } from "../physics/schwarzschild";
import {
  scatteringDeflection,
  scatteringHalfOrbit,
  scatteringTurningPoint,
  weakFieldDeflection,
} from "./schwarzschildOracle";

interface FloatTable {
  readonly width: number;
  readonly height: number;
  readonly channels: number;
  readonly values: Float32Array;
}

function loadFloatTable(path: URL, channels: number): FloatTable {
  const bytes = readFileSync(path);
  const values = new Float32Array(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  );
  const width = values[0] ?? 0;
  const height = values[1] ?? 0;
  return { width, height, channels, values: values.subarray(2) };
}

function sampleFirstChannel(table: FloatTable, u: number, v: number): number {
  const x = Math.min(Math.max(u, 0), 1) * (table.width - 1);
  const y = Math.min(Math.max(v, 0), 1) * (table.height - 1);
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(x0 + 1, table.width - 1);
  const y1 = Math.min(y0 + 1, table.height - 1);
  const tx = x - x0;
  const ty = y - y0;
  const at = (column: number, row: number) =>
    table.values[(row * table.width + column) * table.channels] ?? 0;
  const lower = at(x0, y0) * (1 - tx) + at(x1, y0) * tx;
  const upper = at(x0, y1) * (1 - tx) + at(x1, y1) * tx;
  return lower * (1 - ty) + upper * ty;
}

describe("independent Schwarzschild scattering oracle", () => {
  it("agrees with the two-term weak-field expansion", () => {
    const impact = 100;
    expect(scatteringDeflection(impact)).toBeCloseTo(0.0202999662, 8);
    expect(
      Math.abs(scatteringDeflection(impact) - weakFieldDeflection(impact)),
    ).toBeLessThan(6e-6);
  });

  it("approaches the critical orbit monotonically", () => {
    const impacts = [20, 10, 6, 4, 3, 2.7];
    const deflections = impacts.map((impact) => scatteringDeflection(impact, 8192));
    for (let index = 1; index < deflections.length; index += 1) {
      expect(deflections[index]).toBeGreaterThan(deflections[index - 1] ?? 0);
    }
    expect(scatteringTurningPoint(2.7)).toBeLessThan(2 / 3);
  });

  it("rejects captured and malformed rays", () => {
    expect(() => scatteringTurningPoint(SCHWARZSCHILD.criticalImpactRs)).toThrow(RangeError);
    expect(() => scatteringHalfOrbit(4, 33)).toThrow(RangeError);
  });
});

describe("Bruneton deflection texture versus CPU oracle", () => {
  const table = loadFloatTable(
    new URL("../../public/assets/deflection.dat", import.meta.url),
    2,
  );

  it("retains its declared dimensions", () => {
    expect(table.width).toBe(512);
    expect(table.height).toBe(512);
  });

  it.each([2.7, 3, 4, 6, 10, 20, 100])(
    "matches the half-orbit integral at b = %f r_s",
    (impact) => {
      const energySquared = 1 / impact ** 2;
      const lookupAngle = sampleFirstChannel(
        table,
        deflectionTextureU(energySquared),
        1,
      );
      const oracleAngle = scatteringHalfOrbit(impact) - Math.PI / 2;
      expect(Math.abs(lookupAngle - oracleAngle)).toBeLessThan(3e-5);
    },
  );
});
