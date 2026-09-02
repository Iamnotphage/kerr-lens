import { describe, expect, it } from "vitest";

import { selectKerrTransferLongEdge } from "./KerrLensingMap";

describe("Kerr transfer-map resolution", () => {
  it("tracks the physical drawing buffer within a bounded rebuild budget", () => {
    expect(selectKerrTransferLongEdge(640, 480, false)).toBe(512);
    expect(selectKerrTransferLongEdge(1280, 720, false)).toBe(960);
    expect(selectKerrTransferLongEdge(2048, 1679, false)).toBe(1024);
    expect(selectKerrTransferLongEdge(3840, 2160, false)).toBe(1024);
  });

  it("keeps CPU-backed WebGL validation inexpensive", () => {
    expect(selectKerrTransferLongEdge(640, 480, true)).toBe(224);
    expect(selectKerrTransferLongEdge(3840, 2160, true)).toBe(224);
  });
});
