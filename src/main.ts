import "./style.css";

import { BlackHoleRenderer, type RendererSettings } from "./render/BlackHoleRenderer";
import { ObserverController, type ObserverState } from "./render/ObserverController";
import { PerformanceGovernor, type QualityMode } from "./render/PerformanceGovernor";
import { loadPhysicsTextures } from "./render/loadPhysicsTextures";

function element<T extends HTMLElement>(id: string): T {
  const value = document.getElementById(id);
  if (!value) throw new Error(`Missing required element #${id}`);
  return value as T;
}

const DEFAULT_OBSERVER: ObserverState = {
  radius: 26,
  inclination: (68 * Math.PI) / 180,
  azimuth: 0.36,
};

const canvas = element<HTMLCanvasElement>("scene");
const loading = element<HTMLDivElement>("loading");
const loadingProgress = element<HTMLSpanElement>("loading-progress");
const fatalError = element<HTMLDivElement>("fatal-error");
const fatalErrorDetail = element<HTMLParagraphElement>("fatal-error-detail");
const gestureHint = element<HTMLDivElement>("gesture-hint");

const inclinationInput = element<HTMLInputElement>("inclination");
const distanceInput = element<HTMLInputElement>("distance");
const temperatureInput = element<HTMLInputElement>("temperature");
const exposureInput = element<HTMLInputElement>("exposure");
const qualityInput = element<HTMLSelectElement>("quality");
const diskInput = element<HTMLInputElement>("disk-enabled");
const dopplerInput = element<HTMLInputElement>("doppler-enabled");
const skyInput = element<HTMLInputElement>("sky-enabled");
const pausedInput = element<HTMLInputElement>("paused");

const inclinationValue = element<HTMLOutputElement>("inclination-value");
const distanceValue = element<HTMLOutputElement>("distance-value");
const temperatureValue = element<HTMLOutputElement>("temperature-value");
const exposureValue = element<HTMLOutputElement>("exposure-value");

const fpsElement = element<HTMLSpanElement>("fps");
const frameTimeElement = element<HTMLSpanElement>("frame-time");
const renderScaleElement = element<HTMLSpanElement>("render-scale");

const initialSettings: RendererSettings = {
  temperature: Number(temperatureInput.value),
  exposure: Number(exposureInput.value),
  diskEnabled: diskInput.checked,
  dopplerEnabled: dopplerInput.checked,
  skyEnabled: skyInput.checked,
  paused: pausedInput.checked,
};

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
  governor.setMode(qualityInput.value as QualityMode);

  let observer = { ...DEFAULT_OBSERVER };
  let appliedScale = -1;
  let lastFrame = performance.now();
  let lastHudUpdate = 0;

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
  temperatureInput.addEventListener("input", () => {
    const temperature = Number(temperatureInput.value);
    temperatureValue.value = `${temperature.toLocaleString("en-US")} K`;
    blackHole.updateSettings({ temperature });
  });
  exposureInput.addEventListener("input", () => {
    const exposure = Number(exposureInput.value);
    exposureValue.value = exposure.toFixed(2);
    blackHole.updateSettings({ exposure });
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
  temperatureValue.value = `${initialSettings.temperature.toLocaleString("en-US")} K`;
  exposureValue.value = initialSettings.exposure.toFixed(2);
  applySize();
  await blackHole.warmup();

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

    if (now - lastHudUpdate > 300) {
      const size = blackHole.getDrawingBufferSize();
      fpsElement.textContent = `${Math.round(snapshot.fps)} FPS`;
      frameTimeElement.textContent = `${snapshot.frameMs.toFixed(1)} MS`;
      renderScaleElement.textContent = `${Math.round(snapshot.scale * 100)}% · ${size.x}×${size.y}`;
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
