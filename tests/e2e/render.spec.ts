import { expect, test, type Page } from "@playwright/test";

function watchRuntimeErrors(page: Page): string[] {
  const runtimeErrors: string[] = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") runtimeErrors.push(message.text());
  });
  return runtimeErrors;
}

async function waitForRenderer(page: Page): Promise<void> {
  await expect(page.locator("#loading")).toBeHidden();
  await expect(page.locator("#fatal-error")).toBeHidden();
  await expect(page.locator("#scene")).toBeVisible();
  await expect(page.locator("body")).toHaveAttribute("data-validation-ready", "true");
}

async function waitForKerrMap(page: Page, spin: number): Promise<void> {
  await expect.poll(async () => {
    return page.evaluate(() => {
      const validationWindow = window as typeof window & {
        __KERR_LENS_VALIDATION__?: {
          getReport: () => {
            gpu: { kerrLensing: { ready: boolean; spin: number } };
          };
        };
      };
      return validationWindow.__KERR_LENS_VALIDATION__?.getReport().gpu.kerrLensing;
    });
  }, { timeout: 30_000 }).toMatchObject({ ready: true, spin });
}

test("compiles the WebGL renderer and draws an interactive frame", async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  const runtimeErrors = watchRuntimeErrors(page);

  await page.goto("/");
  await waitForRenderer(page);
  await expect(page.locator("#fps")).not.toHaveText(/--/);
  await expect(page.locator("#render-scale")).toContainText("×");
  await expect(page.locator("#toggle-panel")).toHaveAttribute("aria-expanded", "false");

  await page.locator("#toggle-panel").click();
  await expect(page.locator("#toggle-panel")).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("#disk-appearance")).toHaveValue("cinematic");
  await expect(page.locator("#quality")).toHaveValue("high");
  await expect(page.locator("#interaction-fallback")).toHaveCount(0);
  await expect(page.locator("#model-kerr")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#model-schwarzschild")).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("#spin-value")).toHaveText("+0.800");
  await expect(page.locator("#spacetime-status-title")).toHaveText("PROGRADE KERR LENSING");
  await expect(page.locator("#kerr-horizon-value")).toHaveText("0.800 rₛ");
  await page.locator("#spin").fill("0");
  await expect(page.locator("#spacetime-status-title")).toHaveText("ZERO-SPIN KERR LIMIT");
  await expect(page.locator("#kerr-horizon-value")).toHaveText("1.000 rₛ");
  await expect(page.locator("#kerr-photon-value")).toHaveText("1.500 rₛ");
  await expect(page.locator("#kerr-isco-value")).toHaveText("3.000 rₛ");
  await page.locator("#spin").fill("0.9");
  await expect(page.locator("#spin-value")).toHaveText("+0.900");
  await expect(page.locator("#spacetime-status-title")).toHaveText("PROGRADE KERR LENSING");
  await expect(page.locator("#kerr-horizon-value")).toHaveText("0.718 rₛ");
  await expect(page.locator("#kerr-isco-value")).toHaveText("1.160 rₛ");
  await expect(page.locator("#kerr-efficiency-value")).toHaveText("15.575%");
  await page.locator("#spin").fill("-0.9");
  await expect(page.locator("#spin-value")).toHaveText("-0.900");
  await expect(page.locator("#spacetime-status-title")).toHaveText("RETROGRADE KERR LENSING");
  await expect(page.locator("#kerr-isco-value")).toHaveText("4.359 rₛ");
  await page.locator("#spin").fill("0");
  await expect(page.locator("#spacetime-status-title")).toHaveText("ZERO-SPIN KERR LIMIT");
  await expect(page.locator("#color-temperature-value")).toHaveText("4,500 K");
  await expect(page.locator("#model-readout-detail")).toContainText("mild warm grade");
  await expect(page.locator("#mass")).toBeDisabled();
  await expect(page.locator("#doppler-enabled")).not.toBeChecked();
  await page.locator("#disk-appearance").selectOption("scientific");
  await expect(page.locator("#mass")).toBeEnabled();
  await expect(page.locator("#doppler-enabled")).toBeChecked();
  await expect(page.locator("#color-temperature-value")).toHaveText("37,800 K");
  await page.locator("#inclination").fill("42");
  await expect(page.locator("#inclination-value")).toHaveText("42°");
  await page.locator("#mass").fill("9");
  await page.locator("#eddington-ratio").fill("-1");
  await expect(page.locator("#mass-value")).toHaveText("10⁹ M☉");
  await expect(page.locator("#eddington-ratio-value")).toHaveText("0.100 L_Edd");
  await expect(page.locator("#color-temperature-value")).toHaveText("67,100 K");
  await page.locator("#mass").fill("9.5");
  await page.locator("#eddington-ratio").fill("-1.5");
  await expect(page.locator("#color-temperature-value")).toHaveText("37,800 K");
  await page.locator("#doppler-enabled").uncheck({ force: true });
  await expect(page.locator("#doppler-enabled")).not.toBeChecked();
  await page.locator("#doppler-enabled").check({ force: true });
  await expect(page.locator("#doppler-enabled")).toBeChecked();
  await page.locator("#disk-appearance").selectOption("cinematic");
  await expect(page.locator("#mass")).toBeDisabled();
  await expect(page.locator("#color-temperature-value")).toHaveText("4,500 K");
  await expect(page.locator("#doppler-enabled")).not.toBeChecked();
  await page.locator("#reset-view").click();
  await expect(page.locator("#inclination-value")).toHaveText("85°");
  await expect(page.locator("#distance-value")).toHaveText("26.0 rₛ");
  await page.locator("#toggle-panel").click();
  await expect(page.locator("#toggle-panel")).toHaveAttribute("aria-expanded", "false");

  const canvasBounds = await page.locator("#scene").boundingBox();
  expect(canvasBounds?.width).toBeGreaterThan(600);
  expect(canvasBounds?.height).toBeGreaterThan(400);
  expect(runtimeErrors, runtimeErrors.join("\n")).toEqual([]);

  await page.screenshot({ path: testInfo.outputPath("kerr-lens-v2.1.png"), fullPage: true });

  // A near face-on view exposes any angular wrap discontinuity as a radial
  // wedge, so preserve it as explicit visual evidence in the CI artifact.
  await page.locator("#toggle-panel").click();
  await page.locator("#inclination").fill("8");
  await page.locator("#toggle-panel").click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: testInfo.outputPath("disk-seam-probe.png"), fullPage: true });
});

test("renders distinct positive and negative Kerr lens maps", async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const runtimeErrors = watchRuntimeErrors(page);
  await page.goto("/");
  await waitForRenderer(page);
  await page.locator("#toggle-panel").click();
  await page.locator("#paused").check({ force: true });
  await page.locator("#quality").selectOption("balanced");

  const captureAtSpin = async (spin: number, name: string): Promise<Buffer> => {
    await page.locator("#spin").fill(String(spin));
    if (spin !== 0) await waitForKerrMap(page, spin);
    await page.evaluate(() => {
      window.__KERR_LENS_VALIDATION__?.setSimulationTime(0);
    });
    await page.waitForTimeout(120);
    return page.locator("#scene").screenshot({ path: testInfo.outputPath(name) });
  };

  const schwarzschild = await captureAtSpin(0, "lensing-spin-zero.png");
  const prograde = await captureAtSpin(0.9, "lensing-spin-positive.png");
  const retrograde = await captureAtSpin(-0.9, "lensing-spin-negative.png");
  expect(prograde.equals(schwarzschild)).toBe(false);
  expect(retrograde.equals(schwarzschild)).toBe(false);
  expect(retrograde.equals(prograde)).toBe(false);
  expect(runtimeErrors, runtimeErrors.join("\n")).toEqual([]);
});

test("captures the closest Kerr view without a widened axial repair", async ({
  page,
}, testInfo) => {
  test.setTimeout(60_000);
  const runtimeErrors = watchRuntimeErrors(page);
  await page.setViewportSize({ width: 1600, height: 1200 });
  await page.goto("/");
  await waitForRenderer(page);

  await page.locator("#toggle-panel").click();
  await page.locator("#paused").check({ force: true });
  await page.locator("#spin").fill("0.8");
  await page.locator("#inclination").fill("85");
  await page.locator("#distance").fill("7");
  await page.locator("#toggle-panel").click();
  await waitForKerrMap(page, 0.8);
  await page.evaluate(() => window.__KERR_LENS_VALIDATION__?.setSimulationTime(0));
  await page.waitForTimeout(180);

  const report = await page.evaluate(() => window.__KERR_LENS_VALIDATION__?.getReport());
  expect(report?.observer.radius).toBe(7);
  expect(report?.observer.inclination).toBeCloseTo((85 * Math.PI) / 180, 4);
  expect(report?.gpu.kerrLensing.displayed).toBe(true);
  expect(report?.gpu.kerrLensing.width).toBeGreaterThan(0);
  await page.screenshot({
    path: testInfo.outputPath("kerr-close-axis-continuity.png"),
    fullPage: true,
  });
  expect(runtimeErrors, runtimeErrors.join("\n")).toEqual([]);
});

test("switches models manually and restores the previous Kerr spin", async ({ page }) => {
  const runtimeErrors = watchRuntimeErrors(page);
  await page.goto("/");
  await waitForRenderer(page);
  await page.locator("#toggle-panel").click();

  await page.locator("#spin").fill("-0.65");
  await waitForKerrMap(page, -0.65);
  await page.locator("#model-schwarzschild").click();

  await expect(page.locator("#model-kerr")).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("#model-schwarzschild")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#panel-title")).toHaveText("Schwarzschild lensing");
  await expect(page.locator("#spacetime-metric-label")).toHaveText("SCHWARZSCHILD PARAMETERS");
  await expect(page.locator("#spacetime-status-title")).toHaveText(
    "EXACT SCHWARZSCHILD LENSING",
  );
  await expect(page.locator("#spin")).toBeDisabled();
  await expect(page.locator("#spin")).toHaveValue("0");
  await expect(page.locator("#spin-value")).toHaveText("0.000");

  const schwarzschild = await page.evaluate(() => {
    return window.__KERR_LENS_VALIDATION__?.getReport();
  });
  expect(schwarzschild?.spacetimeModel).toBe("schwarzschild");
  expect(schwarzschild?.kerr.spin).toBe(0);
  expect(schwarzschild?.gpu.kerrLensing.displayed).toBe(false);

  await page.locator("#model-kerr").click();
  await expect(page.locator("#model-kerr")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#model-schwarzschild")).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("#panel-title")).toHaveText("Kerr lensing");
  await expect(page.locator("#spin")).toBeEnabled();
  await expect(page.locator("#spin")).toHaveValue("-0.65");
  await expect(page.locator("#spin-value")).toHaveText("-0.650");
  await waitForKerrMap(page, -0.65);

  const kerr = await page.evaluate(() => {
    return window.__KERR_LENS_VALIDATION__?.getReport();
  });
  expect(kerr?.spacetimeModel).toBe("kerr");
  expect(kerr?.kerr.spin).toBe(-0.65);
  expect(kerr?.gpu.kerrLensing.displayed).toBe(true);
  expect(runtimeErrors, runtimeErrors.join("\n")).toEqual([]);
});

test("keeps full-quality Kerr rendering active during drag by default", async ({
  page,
}) => {
  const runtimeErrors = watchRuntimeErrors(page);
  await page.goto("/");
  await waitForRenderer(page);
  await waitForKerrMap(page, 0.8);

  const beforeDrag = await page.evaluate(() => {
    return window.__KERR_LENS_VALIDATION__?.getReport();
  });

  const canvas = page.locator("#scene");
  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();
  const startX = bounds!.x + bounds!.width * 0.62;
  const startY = bounds!.y + bounds!.height * 0.48;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 18, startY - 42, { steps: 3 });

  const duringDrag = await page.evaluate(() => {
    return window.__KERR_LENS_VALIDATION__?.getReport();
  });
  await page.mouse.up();

  expect(duringDrag?.observer.inclination).not.toBeCloseTo((85 * Math.PI) / 180, 4);
  expect(duringDrag?.spacetimeModel).toBe("kerr");
  expect(duringDrag?.drawingBuffer).toEqual(beforeDrag?.drawingBuffer);
  expect(duringDrag?.gpu.kerrLensing.ready).toBe(true);
  expect(duringDrag?.gpu.kerrLensing.displayed).toBe(true);
  await expect.poll(async () => {
    const report = await page.evaluate(() => {
      return window.__KERR_LENS_VALIDATION__?.getReport();
    });
    return report?.gpu.kerrLensing.observerInclination;
  }).toBeCloseTo(duringDrag!.observer.inclination, 4);
  expect(runtimeErrors, runtimeErrors.join("\n")).toEqual([]);
});

test("keeps finite-coherence disk structure after long simulation times", async ({
  page,
}, testInfo) => {
  const runtimeErrors = watchRuntimeErrors(page);
  await page.goto("/");
  await waitForRenderer(page);

  await page.locator("#toggle-panel").click();
  await page.locator("#paused").check({ force: true });
  await page.locator("#inclination").fill("8");
  await page.locator("#toggle-panel").click();

  for (const simulationTime of [0, 3_600, 86_400]) {
    const report = await page.evaluate((time) => {
      const validationWindow = window as typeof window & {
        __KERR_LENS_VALIDATION__?: {
          getReport: () => { simulationTime: number };
          setSimulationTime: (value: number) => void;
        };
      };
      validationWindow.__KERR_LENS_VALIDATION__?.setSimulationTime(time);
      return validationWindow.__KERR_LENS_VALIDATION__?.getReport();
    }, simulationTime);
    expect(report?.simulationTime).toBe(simulationTime);
    await page.waitForTimeout(180);
    await page.screenshot({
      path: testInfo.outputPath(`disk-coherence-t${simulationTime}.png`),
      fullPage: true,
    });
  }

  expect(runtimeErrors, runtimeErrors.join("\n")).toEqual([]);
});

test("captures the appearance and inclination validation matrix", async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  const runtimeErrors = watchRuntimeErrors(page);
  await page.goto("/");
  await waitForRenderer(page);

  const panelButton = page.locator("#toggle-panel");
  await panelButton.click();
  await page.locator("#quality").selectOption("balanced");
  await page.locator("#paused").check({ force: true });

  for (const appearance of ["cinematic", "scientific"] as const) {
    await page.locator("#disk-appearance").selectOption(appearance);
    for (const inclination of [8, 45, 85]) {
      await page.locator("#inclination").fill(String(inclination));
      await panelButton.click();
      await page.waitForTimeout(180);
      await page.screenshot({
        path: testInfo.outputPath(`matrix-${appearance}-${inclination}deg.png`),
        fullPage: true,
      });
      await panelButton.click();
    }
  }

  expect(runtimeErrors, runtimeErrors.join("\n")).toEqual([]);
});

test("exports a fixed-scene frame-time distribution", async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  const runtimeErrors = watchRuntimeErrors(page);
  await page.goto("/?benchmark=1&frames=120");
  await waitForRenderer(page);
  await expect(page.locator("#benchmark-panel")).toHaveAttribute("data-state", "complete", {
    timeout: 45_000,
  });

  const report = await page.evaluate(() => {
    const validationWindow = window as typeof window & {
      __KERR_LENS_VALIDATION__?: { getReport: () => unknown };
    };
    return validationWindow.__KERR_LENS_VALIDATION__?.getReport();
  });
  expect(report).toBeTruthy();
  const result = report as {
    frames: { sampleCount: number; medianMs: number; p95Ms: number; p99Ms: number };
    drawingBuffer: [number, number];
    gpu: { drawCalls: number; triangles: number; renderer: string; skyAnisotropy: number };
  };
  expect(result.frames.sampleCount).toBe(120);
  expect(result.frames.p95Ms).toBeGreaterThanOrEqual(result.frames.medianMs);
  expect(result.frames.p99Ms).toBeGreaterThanOrEqual(result.frames.p95Ms);
  expect(result.drawingBuffer[0]).toBeGreaterThan(0);
  expect(result.drawingBuffer[1]).toBeGreaterThan(0);
  expect(result.gpu.drawCalls).toBe(1);
  expect(result.gpu.triangles).toBe(1);
  expect(result.gpu.skyAnisotropy).toBeGreaterThanOrEqual(1);
  expect(result.gpu.skyAnisotropy).toBeLessThanOrEqual(8);
  if (/swiftshader|llvmpipe|software/i.test(result.gpu.renderer)) {
    expect(result.gpu.skyAnisotropy).toBe(1);
  }
  expect(result.gpu.renderer.length).toBeGreaterThan(0);
  expect(runtimeErrors, runtimeErrors.join("\n")).toEqual([]);

  await testInfo.attach("benchmark-v2.1.json", {
    body: JSON.stringify(report, null, 2),
    contentType: "application/json",
  });
  await page.screenshot({ path: testInfo.outputPath("benchmark-v2.1.png"), fullPage: true });
});
