import "./style.css";

import { thermalDiskParameters } from "./physics/thinDisk";
import {
  BlackHoleRenderer,
  type DiskAppearance,
  type RendererSettings,
} from "./render/BlackHoleRenderer";
import { ObserverController, type ObserverState } from "./render/ObserverController";
import { PerformanceGovernor, type QualityMode } from "./render/PerformanceGovernor";
import { loadPhysicsTextures } from "./render/loadPhysicsTextures";
import {
  FrameBenchmark,
  type FrameBenchmarkProgress,
  type FrameStatistics,
} from "./validation/FrameBenchmark";

interface ValidationReport {
  readonly version: "1.3";
  readonly observer: ObserverState;
  readonly appearance: DiskAppearance;
  readonly quality: QualityMode;
  readonly drawingBuffer: readonly [number, number];
  readonly devicePixelRatio: number;
  readonly gpu: ReturnType<BlackHoleRenderer["getDiagnostics"]>;
  readonly frames: FrameStatistics | null;
}

declare global {
  interface Window {
    __KERR_LENS_VALIDATION__?: {
      ready: boolean;
      getReport: () => ValidationReport;
      resetBenchmark: () => void;
    };
  }
}

function element<T extends HTMLElement>(id: string): T {
  const value = document.getElementById(id);
  if (!value) throw new Error(`Missing required element #${id}`);
  return value as T;
}

const DEFAULT_OBSERVER: ObserverState = {
  radius: 26,
  inclination: (85 * Math.PI) / 180,
  azimuth: 0.36,
};

const canvas = element<HTMLCanvasElement>("scene");
const loading = element<HTMLDivElement>("loading");
const loadingProgress = element<HTMLSpanElement>("loading-progress");
const fatalError = element<HTMLDivElement>("fatal-error");
const fatalErrorDetail = element<HTMLParagraphElement>("fatal-error-detail");
const gestureHint = element<HTMLDivElement>("gesture-hint");
const benchmarkPanel = element<HTMLElement>("benchmark-panel");
const benchmarkPhase = element<HTMLParagraphElement>("benchmark-phase");
const benchmarkSamples = element<HTMLOutputElement>("benchmark-samples");
const benchmarkMedian = element<HTMLOutputElement>("benchmark-median");
const benchmarkP95 = element<HTMLOutputElement>("benchmark-p95");
const benchmarkP99 = element<HTMLOutputElement>("benchmark-p99");
const benchmarkBuffer = element<HTMLOutputElement>("benchmark-buffer");
const benchmarkDraws = element<HTMLOutputElement>("benchmark-draws");
const benchmarkGpu = element<HTMLParagraphElement>("benchmark-gpu");
const benchmarkCopy = element<HTMLButtonElement>("benchmark-copy");

const searchParameters = new URLSearchParams(window.location.search);
const benchmarkMode = searchParameters.get("benchmark") === "1";
const requestedBenchmarkFrames = Number(searchParameters.get("frames") ?? 600);
const benchmarkFrameCount = Number.isFinite(requestedBenchmarkFrames)
  ? Math.min(Math.max(Math.round(requestedBenchmarkFrames), 60), 1200)
  : 600;
if (benchmarkMode) {
  document.body.classList.add("benchmark-mode");
  benchmarkPanel.hidden = false;
}

const inclinationInput = element<HTMLInputElement>("inclination");
const distanceInput = element<HTMLInputElement>("distance");
const massInput = element<HTMLInputElement>("mass");
const eddingtonRatioInput = element<HTMLInputElement>("eddington-ratio");
const exposureInput = element<HTMLInputElement>("exposure");
const appearanceInput = element<HTMLSelectElement>("disk-appearance");
const qualityInput = element<HTMLSelectElement>("quality");
const diskInput = element<HTMLInputElement>("disk-enabled");
const dopplerInput = element<HTMLInputElement>("doppler-enabled");
const skyInput = element<HTMLInputElement>("sky-enabled");
const pausedInput = element<HTMLInputElement>("paused");

const inclinationValue = element<HTMLOutputElement>("inclination-value");
const distanceValue = element<HTMLOutputElement>("distance-value");
const massValue = element<HTMLOutputElement>("mass-value");
const eddingtonRatioValue = element<HTMLOutputElement>("eddington-ratio-value");
const colorTemperatureValue = element<HTMLOutputElement>("color-temperature-value");
const modelReadoutLabel = element<HTMLSpanElement>("model-readout-label");
const modelReadoutDetail = element<HTMLElement>("model-readout-detail");
const appearanceNote = element<HTMLParagraphElement>("appearance-note");
const exposureValue = element<HTMLOutputElement>("exposure-value");
const heroEyebrow = element<HTMLParagraphElement>("hero-eyebrow");
const heroDetail = element<HTMLParagraphElement>("hero-detail");

const fpsElement = element<HTMLSpanElement>("fps");
const frameTimeElement = element<HTMLSpanElement>("frame-time");
const renderScaleElement = element<HTMLSpanElement>("render-scale");

const initialDisk = thermalDiskParameters(
  10 ** Number(massInput.value),
  10 ** Number(eddingtonRatioInput.value),
);

const initialSettings: RendererSettings = {
  peakColorTemperature: initialDisk.peakColorTemperatureK,
  spectralDilution: initialDisk.spectralDilution,
  exposure: Number(exposureInput.value),
  diskAppearance: appearanceInput.value as DiskAppearance,
  diskEnabled: diskInput.checked,
  dopplerEnabled: dopplerInput.checked,
  skyEnabled: skyInput.checked,
  paused: pausedInput.checked || benchmarkMode,
};

const superscriptDigits: Record<string, string> = {
  "0": "⁰",
  "1": "¹",
  "2": "²",
  "3": "³",
  "4": "⁴",
  "5": "⁵",
  "6": "⁶",
  "7": "⁷",
  "8": "⁸",
  "9": "⁹",
};

function formatMass(massSolar: number): string {
  const exponent = Math.floor(Math.log10(massSolar));
  const coefficient = massSolar / 10 ** exponent;
  const exponentLabel = String(exponent)
    .split("")
    .map((digit) => superscriptDigits[digit] ?? digit)
    .join("");
  const coefficientLabel = coefficient < 1.05 ? "" : `${coefficient.toFixed(1)}×`;
  return `${coefficientLabel}10${exponentLabel} M☉`;
}

function formatTemperature(temperatureK: number): string {
  const rounded = Math.round(temperatureK / 100) * 100;
  return `${rounded.toLocaleString("en-US")} K`;
}

function formatAccretionRate(rateSolarPerYear: number): string {
  const digits = rateSolarPerYear >= 10 ? 1 : rateSolarPerYear >= 1 ? 2 : 3;
  return `${rateSolarPerYear.toFixed(digits)} M☉/yr`;
}

function showFatalError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  loading.hidden = true;
  fatalError.hidden = false;
  fatalErrorDetail.textContent = message;
  console.error(error);
}

function bindPanelToggle(): void {
  const button = element<HTMLButtonElement>("toggle-panel");
  const panel = element<HTMLElement>("control-panel");
  button.addEventListener("click", () => {
    const collapsed = panel.classList.toggle("panel--collapsed");
    button.setAttribute("aria-expanded", String(!collapsed));
    button.setAttribute("aria-label", collapsed ? "Expand controls" : "Collapse controls");
  });
}

async function start(): Promise<void> {
  bindPanelToggle();
  const physicsTextures = await loadPhysicsTextures((fraction) => {
    loadingProgress.textContent = `${Math.round(fraction * 100)}%`;
  });

  const blackHole = new BlackHoleRenderer(canvas, physicsTextures, DEFAULT_OBSERVER, initialSettings);
  const governor = new PerformanceGovernor();
  if (benchmarkMode) {
    qualityInput.value = "balanced";
    pausedInput.checked = true;
  }
  governor.setMode(qualityInput.value as QualityMode);

  const frameBenchmark = new FrameBenchmark(90, benchmarkFrameCount);
  let benchmarkProgress: FrameBenchmarkProgress = frameBenchmark.progress();

  let observer = { ...DEFAULT_OBSERVER };
  let appliedScale = -1;
  let lastFrame = performance.now();
  let lastHudUpdate = 0;

  const validationReport = (): ValidationReport => {
    const buffer = blackHole.getDrawingBufferSize();
    return {
      version: "1.3",
      observer: { ...observer },
      appearance: appearanceInput.value as DiskAppearance,
      quality: qualityInput.value as QualityMode,
      drawingBuffer: [buffer.x, buffer.y],
      devicePixelRatio: window.devicePixelRatio || 1,
      gpu: blackHole.getDiagnostics(),
      frames: benchmarkProgress.statistics,
    };
  };

  const updateBenchmarkUi = (): void => {
    if (!benchmarkMode) return;
    const completedSamples = benchmarkFrameCount - benchmarkProgress.samplesRemaining;
    benchmarkSamples.value = `${completedSamples} / ${benchmarkFrameCount}`;
    const buffer = blackHole.getDrawingBufferSize();
    benchmarkBuffer.value = `${buffer.x}×${buffer.y}`;
    const diagnostics = blackHole.getDiagnostics();
    benchmarkDraws.value = `${diagnostics.drawCalls} call · ${diagnostics.triangles} tri`;
    benchmarkGpu.textContent = `${diagnostics.renderer} · ${diagnostics.webglVersion}`;

    if (benchmarkProgress.phase === "warmup") {
      benchmarkPhase.textContent = `Discarding ${benchmarkProgress.warmupRemaining} warm-up frames`;
      benchmarkPanel.dataset.state = "warmup";
    } else if (benchmarkProgress.phase === "sampling") {
      benchmarkPhase.textContent = "Recording steady-state requestAnimationFrame intervals";
      benchmarkPanel.dataset.state = "sampling";
    } else if (benchmarkProgress.statistics) {
      const statistics = benchmarkProgress.statistics;
      benchmarkPhase.textContent = "Benchmark complete · report is ready to export";
      benchmarkMedian.value = `${statistics.medianMs.toFixed(2)} ms`;
      benchmarkP95.value = `${statistics.p95Ms.toFixed(2)} ms`;
      benchmarkP99.value = `${statistics.p99Ms.toFixed(2)} ms`;
      benchmarkPanel.dataset.state = "complete";
    }
  };

  window.__KERR_LENS_VALIDATION__ = {
    ready: false,
    getReport: validationReport,
    resetBenchmark: () => {
      frameBenchmark.reset();
      benchmarkProgress = frameBenchmark.progress();
      benchmarkMedian.value = "—";
      benchmarkP95.value = "—";
      benchmarkP99.value = "—";
      updateBenchmarkUi();
    },
  };

  benchmarkCopy.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(validationReport(), null, 2));
      benchmarkCopy.textContent = "Copied";
    } catch {
      benchmarkCopy.textContent = "Clipboard unavailable";
    }
  });

  const applySize = (scale = governor.getScale()): void => {
    const baseRatio = Math.min(window.devicePixelRatio || 1, 1.5);
    blackHole.resize(window.innerWidth, window.innerHeight, baseRatio * scale);
    appliedScale = scale;
  };

  const updateObserverUi = (state: ObserverState): void => {
    const degrees = Math.round((state.inclination * 180) / Math.PI);
    inclinationInput.value = String(degrees);
    distanceInput.value = state.radius.toFixed(1);
    inclinationValue.value = `${degrees}°`;
    distanceValue.value = `${state.radius.toFixed(1)} rₛ`;
  };

  let activeDisk = initialDisk;

  const updateAppearanceUi = (appearance: DiskAppearance): void => {
    const cinematic = appearance === "cinematic";
    massInput.disabled = cinematic;
    eddingtonRatioInput.disabled = cinematic;
    massInput.closest(".control")?.classList.toggle("control--disabled", cinematic);
    eddingtonRatioInput.closest(".control")?.classList.toggle("control--disabled", cinematic);

    if (cinematic) {
      modelReadoutLabel.textContent = "CINEMATIC REFERENCE · ART-DIRECTED";
      colorTemperatureValue.value = "4,500 K";
      modelReadoutDetail.textContent = "DNGR-inspired · mild warm grade · marginal depth";
      appearanceNote.textContent =
        "4500 K source with a mild warm film grade; geodesic lensing remains physical.";
      heroEyebrow.textContent = "DNGR-INSPIRED CINEMATIC DISK";
      heroDetail.textContent =
        "Schwarzschild geodesics lens a warm, marginally opaque 4500\u00a0K presentation disk.";
    } else {
      modelReadoutLabel.textContent = "DERIVED COLOR PEAK · fcol 1.7";
      colorTemperatureValue.value = formatTemperature(activeDisk.peakColorTemperatureK);
      modelReadoutDetail.textContent =
        `${formatTemperature(activeDisk.peakEffectiveTemperatureK)} effective · ` +
        `${formatAccretionRate(activeDisk.accretionRateSolarPerYear)}`;
      appearanceNote.textContent =
        "Page–Thorne flux, diluted blackbody spectrum, and an optically thick surface.";
      heroEyebrow.textContent = "PAGE–THORNE THERMAL DISK";
      heroDetail.textContent =
        "Null geodesics bend the image; mass and accretion rate set the disk spectrum.";
    }
  };

  const updateDiskModel = (): void => {
    activeDisk = thermalDiskParameters(
      10 ** Number(massInput.value),
      10 ** Number(eddingtonRatioInput.value),
    );
    massValue.value = formatMass(activeDisk.massSolar);
    eddingtonRatioValue.value = `${activeDisk.eddingtonRatio.toFixed(3)} L_Edd`;
    blackHole.updateSettings({
      peakColorTemperature: activeDisk.peakColorTemperatureK,
      spectralDilution: activeDisk.spectralDilution,
    });
    updateAppearanceUi(appearanceInput.value as DiskAppearance);
  };

  const controller = new ObserverController(canvas, observer, {
    onChange: (next) => {
      observer = next;
      updateObserverUi(next);
      blackHole.updateObserver(next);
    },
    onInteraction: () => governor.markInteraction(),
    onFirstInteraction: () => gestureHint.classList.add("gesture-hint--hidden"),
  });

  inclinationInput.addEventListener("input", () => {
    controller.setState({ inclination: (Number(inclinationInput.value) * Math.PI) / 180 });
    governor.markInteraction();
  });
  distanceInput.addEventListener("input", () => {
    controller.setState({ radius: Number(distanceInput.value) });
    governor.markInteraction();
  });
  massInput.addEventListener("input", updateDiskModel);
  eddingtonRatioInput.addEventListener("input", updateDiskModel);
  exposureInput.addEventListener("input", () => {
    const exposure = Number(exposureInput.value);
    exposureValue.value = exposure.toFixed(2);
    blackHole.updateSettings({ exposure });
  });
  appearanceInput.addEventListener("change", () => {
    const diskAppearance = appearanceInput.value as DiskAppearance;
    const cinematic = diskAppearance === "cinematic";
    dopplerInput.checked = !cinematic;
    blackHole.updateSettings({
      diskAppearance,
      dopplerEnabled: dopplerInput.checked,
    });
    updateAppearanceUi(diskAppearance);
    governor.markInteraction(350);
  });
  qualityInput.addEventListener("change", () => {
    governor.setMode(qualityInput.value as QualityMode);
    applySize();
  });
  diskInput.addEventListener("change", () => blackHole.updateSettings({ diskEnabled: diskInput.checked }));
  dopplerInput.addEventListener("change", () => blackHole.updateSettings({ dopplerEnabled: dopplerInput.checked }));
  skyInput.addEventListener("change", () => blackHole.updateSettings({ skyEnabled: skyInput.checked }));
  pausedInput.addEventListener("change", () => blackHole.updateSettings({ paused: pausedInput.checked }));

  element<HTMLButtonElement>("reset-view").addEventListener("click", () => {
    controller.setState(DEFAULT_OBSERVER);
    governor.markInteraction(350);
  });

  window.addEventListener("resize", () => applySize());
  document.addEventListener("visibilitychange", () => {
    lastFrame = performance.now();
  });

  updateObserverUi(observer);
  updateDiskModel();
  exposureValue.value = initialSettings.exposure.toFixed(2);
  applySize();
  await blackHole.warmup();

  if (window.__KERR_LENS_VALIDATION__) window.__KERR_LENS_VALIDATION__.ready = true;
  document.body.dataset.validationReady = "true";
  updateBenchmarkUi();

  loading.classList.add("loading--hidden");
  window.setTimeout(() => {
    loading.hidden = true;
  }, 520);

  const renderFrame = (now: number): void => {
    const deltaMs = Math.min(now - lastFrame, 100);
    lastFrame = now;
    const snapshot = governor.update(deltaMs, now);

    if (Math.abs(snapshot.scale - appliedScale) >= 0.025) applySize(snapshot.scale);
    blackHole.render(deltaMs / 1000, observer);
    if (benchmarkMode && benchmarkProgress.phase !== "complete") {
      benchmarkProgress = frameBenchmark.record(deltaMs);
    }

    if (now - lastHudUpdate > 300) {
      const size = blackHole.getDrawingBufferSize();
      fpsElement.textContent = `${Math.round(snapshot.fps)} FPS`;
      frameTimeElement.textContent = `${snapshot.frameMs.toFixed(1)} MS`;
      renderScaleElement.textContent = `${Math.round(snapshot.scale * 100)}% · ${size.x}×${size.y}`;
      updateBenchmarkUi();
      lastHudUpdate = now;
    }
    requestAnimationFrame(renderFrame);
  };
  requestAnimationFrame((now) => {
    lastFrame = now;
    requestAnimationFrame(renderFrame);
  });

  window.addEventListener("beforeunload", () => {
    controller.dispose();
    blackHole.dispose();
  });
}

start().catch(showFatalError);
