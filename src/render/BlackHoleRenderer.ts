import {
  BufferGeometry,
  Camera,
  Float32BufferAttribute,
  GLSL3,
  Mesh,
  NoBlending,
  RawShaderMaterial,
  Scene,
  Vector2,
  Vector3,
  Vector4,
  WebGLRenderer,
} from "three";

import { staticObserver } from "../physics/schwarzschild";
import fragmentShader from "../shaders/black-hole.frag.glsl?raw";
import vertexShader from "../shaders/fullscreen.vert.glsl?raw";
import type { ObserverState } from "./ObserverController";
import { wrapDiskFlowTime } from "./diskFlow";
import {
  KERR_SPIN_THRESHOLD,
  KerrLensingMap,
  type KerrLensingMapState,
} from "./KerrLensingMap";
import type { PhysicsTextures } from "./loadPhysicsTextures";

export type DiskAppearance = "cinematic" | "scientific";

export interface RendererSettings {
  spin: number;
  peakColorTemperature: number;
  spectralDilution: number;
  exposure: number;
  diskAppearance: DiskAppearance;
  diskEnabled: boolean;
  dopplerEnabled: boolean;
  skyEnabled: boolean;
  paused: boolean;
}

export interface RendererDiagnostics {
  readonly vendor: string;
  readonly renderer: string;
  readonly webglVersion: string;
  readonly shadingLanguageVersion: string;
  readonly drawCalls: number;
  readonly triangles: number;
  readonly kerrLensing: KerrLensingMapState & {
    readonly displayed: boolean;
  };
}

export class BlackHoleRenderer {
  readonly renderer: WebGLRenderer;

  private readonly canvas: HTMLCanvasElement;
  private readonly scene = new Scene();
  private readonly camera = new Camera();
  private readonly material: RawShaderMaterial;
  private readonly geometry: BufferGeometry;
  private readonly kerrLensingMap: KerrLensingMap;
  private readonly resolution = new Vector2(1, 1);
  private simulationTime = 0;
  private settings: RendererSettings;

  constructor(
    canvas: HTMLCanvasElement,
    physicsTextures: PhysicsTextures,
    observer: ObserverState,
    settings: RendererSettings,
  ) {
    this.canvas = canvas;
    this.settings = { ...settings };
    this.renderer = new WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      depth: false,
      stencil: false,
      powerPreference: "high-performance",
      preserveDrawingBuffer: false,
    });

    if (!this.renderer.capabilities.isWebGL2) {
      throw new Error("The beam-tracing shader requires WebGL 2.");
    }
    if (!this.renderer.extensions.has("OES_texture_float_linear")) {
      throw new Error("This GPU does not support linear filtering of floating-point geodesic tables.");
    }

    this.renderer.debug.checkShaderErrors = true;
    this.renderer.setClearColor(0x02040a, 1);

    const context = this.renderer.getContext();
    const debugInfo = context.getExtension("WEBGL_debug_renderer_info") as {
      readonly UNMASKED_RENDERER_WEBGL: number;
    } | null;
    const rendererName = String(
      context.getParameter(debugInfo?.UNMASKED_RENDERER_WEBGL ?? context.RENDERER) ?? "",
    );
    const softwareRenderer = /swiftshader|llvmpipe|software/i.test(rendererName);
    this.kerrLensingMap = new KerrLensingMap(this.renderer, softwareRenderer);

    this.material = new RawShaderMaterial({
      glslVersion: GLSL3,
      vertexShader,
      fragmentShader,
      blending: NoBlending,
      depthTest: false,
      depthWrite: false,
      transparent: false,
      uniforms: {
        uResolution: { value: this.resolution },
        uFovY: { value: (48 * Math.PI) / 180 },
        uCameraCoordinates: { value: new Vector4() },
        uCameraPosition: { value: new Vector3() },
        uCameraFourVelocity: { value: new Vector4() },
        uCameraTimeAxis: { value: new Vector3() },
        uCameraRightAxis: { value: new Vector3() },
        uCameraUpAxis: { value: new Vector3() },
        uCameraOutwardAxis: { value: new Vector3() },
        uDeflectionTexture: { value: physicsTextures.deflection },
        uInverseRadiusTexture: { value: physicsTextures.inverseRadius },
        uBlackBodyTexture: { value: physicsTextures.blackBody },
        uDiskTemperatureTexture: { value: physicsTextures.diskTemperature },
        uNoiseTexture: { value: physicsTextures.noise },
        uSkyTexture: { value: physicsTextures.sky },
        uKerrSkyTexture: { value: this.kerrLensingMap.target.textures[0] },
        uKerrDiskHit0Texture: { value: this.kerrLensingMap.target.textures[1] },
        uKerrDiskHit1Texture: { value: this.kerrLensingMap.target.textures[2] },
        uKerrShadowTexture: { value: this.kerrLensingMap.shadowTexture },
        uTime: { value: 0 },
        uExposure: { value: settings.exposure },
        uDiskPeakTemperature: { value: settings.peakColorTemperature },
        uSpectralDilution: { value: settings.spectralDilution },
        uDiskAppearance: { value: settings.diskAppearance === "cinematic" ? 1 : 0 },
        uDiskEnabled: { value: settings.diskEnabled ? 1 : 0 },
        uDopplerEnabled: { value: settings.dopplerEnabled ? 1 : 0 },
        uSkyEnabled: { value: settings.skyEnabled ? 1 : 0 },
        uKerrMapReady: { value: 0 },
        uKerrSpin: { value: settings.spin },
        uKerrObserverRadiusRs: { value: observer.radius },
        uKerrObserverInclination: { value: observer.inclination },
        uKerrShadowCenter: { value: new Vector2() },
      },
    });

    // One oversized triangle avoids the diagonal interpolation seam of a quad.
    this.geometry = new BufferGeometry();
    this.geometry.setAttribute(
      "position",
      new Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3),
    );
    const mesh = new Mesh(this.geometry, this.material);
    mesh.frustumCulled = false;
    this.scene.add(mesh);

    this.updateObserver(observer);
  }

  async warmup(): Promise<void> {
    await this.renderer.compileAsync(this.scene, this.camera);
    await this.kerrLensingMap.compile(this.renderer);
    if (this.kerrLensingMap.renderIfNeeded(this.renderer, true)) this.syncKerrMap();
  }

  updateObserver(state: ObserverState): void {
    const observer = staticObserver(
      state.radius,
      state.inclination,
      state.azimuth,
      wrapDiskFlowTime(this.simulationTime),
    );
    (this.material.uniforms.uCameraCoordinates?.value as Vector4).fromArray(observer.coordinates);
    (this.material.uniforms.uCameraPosition?.value as Vector3).fromArray(observer.position);
    (this.material.uniforms.uCameraFourVelocity?.value as Vector4).fromArray(observer.fourVelocity);
    (this.material.uniforms.uCameraTimeAxis?.value as Vector3).fromArray(observer.timeAxis);
    (this.material.uniforms.uCameraRightAxis?.value as Vector3).fromArray(observer.rightAxis);
    (this.material.uniforms.uCameraUpAxis?.value as Vector3).fromArray(observer.upAxis);
    (this.material.uniforms.uCameraOutwardAxis?.value as Vector3).fromArray(observer.outwardAxis);
    // A parameter change only dirties the back-end transfer map. Keep the last
    // complete Kerr map on screen until its replacement is ready; dropping to
    // Schwarzschild during the settle window changes the apparent shadow size.
    this.kerrLensingMap.request(this.settings.spin, state);
  }

  updateSettings(settings: Partial<RendererSettings>): void {
    this.settings = { ...this.settings, ...settings };
    if (settings.spin !== undefined) {
      if (Math.abs(settings.spin) < KERR_SPIN_THRESHOLD) {
        // The exact zero-spin path is intentionally Schwarzschild, so do not
        // leave a stale rotating map visible before the next animation frame.
        this.material.uniforms.uKerrMapReady!.value = 0;
      } else if (this.kerrLensingMap.getState().ready) {
        // Re-enable a still-valid map if the control crossed zero twice before
        // a frame had a chance to process the intermediate request.
        this.material.uniforms.uKerrMapReady!.value = 1;
      }
    }
    if (settings.peakColorTemperature !== undefined) {
      this.material.uniforms.uDiskPeakTemperature!.value = settings.peakColorTemperature;
    }
    if (settings.spectralDilution !== undefined) {
      this.material.uniforms.uSpectralDilution!.value = settings.spectralDilution;
    }
    if (settings.diskAppearance !== undefined) {
      this.material.uniforms.uDiskAppearance!.value = settings.diskAppearance === "cinematic" ? 1 : 0;
    }
    if (settings.exposure !== undefined) this.material.uniforms.uExposure!.value = settings.exposure;
    if (settings.diskEnabled !== undefined) this.material.uniforms.uDiskEnabled!.value = settings.diskEnabled ? 1 : 0;
    if (settings.dopplerEnabled !== undefined) this.material.uniforms.uDopplerEnabled!.value = settings.dopplerEnabled ? 1 : 0;
    if (settings.skyEnabled !== undefined) this.material.uniforms.uSkyEnabled!.value = settings.skyEnabled ? 1 : 0;
  }

  resize(cssWidth: number, cssHeight: number, pixelRatio: number): void {
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(Math.max(cssWidth, 1), Math.max(cssHeight, 1), false);
    this.renderer.getDrawingBufferSize(this.resolution);
    if (this.kerrLensingMap.resize(cssWidth, cssHeight)) {
      this.material.uniforms.uKerrMapReady!.value = 0;
    }
  }

  render(deltaSeconds: number, observer: ObserverState): void {
    if (!this.settings.paused) this.simulationTime += Math.min(deltaSeconds, 0.05) * 7.5;
    this.material.uniforms.uTime!.value = wrapDiskFlowTime(this.simulationTime);
    this.updateObserver(observer);
    if (this.kerrLensingMap.renderIfNeeded(this.renderer)) this.syncKerrMap();
    this.renderer.render(this.scene, this.camera);
  }

  setSimulationTime(simulationTime: number): void {
    const flowTime = wrapDiskFlowTime(simulationTime);
    this.simulationTime = simulationTime;
    this.material.uniforms.uTime!.value = flowTime;
  }

  getSimulationTime(): number {
    return this.simulationTime;
  }

  getDrawingBufferSize(): Vector2 {
    return this.renderer.getDrawingBufferSize(new Vector2());
  }

  getDiagnostics(): RendererDiagnostics {
    const context = this.renderer.getContext();
    const debugInfo = context.getExtension("WEBGL_debug_renderer_info") as {
      readonly UNMASKED_VENDOR_WEBGL: number;
      readonly UNMASKED_RENDERER_WEBGL: number;
    } | null;
    const parameter = (name: number): string => String(context.getParameter(name) ?? "unknown");
    return {
      vendor: debugInfo ? parameter(debugInfo.UNMASKED_VENDOR_WEBGL) : parameter(context.VENDOR),
      renderer: debugInfo
        ? parameter(debugInfo.UNMASKED_RENDERER_WEBGL)
        : parameter(context.RENDERER),
      webglVersion: parameter(context.VERSION),
      shadingLanguageVersion: parameter(context.SHADING_LANGUAGE_VERSION),
      drawCalls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
      kerrLensing: {
        ...this.kerrLensingMap.getState(),
        displayed: this.material.uniforms.uKerrMapReady!.value === 1,
      },
    };
  }

  private syncKerrMap(): void {
    const state = this.kerrLensingMap.getState();
    this.material.uniforms.uKerrMapReady!.value = state.ready ? 1 : 0;
    this.material.uniforms.uKerrSpin!.value = state.spin;
    this.material.uniforms.uKerrObserverRadiusRs!.value = state.observerRadius;
    this.material.uniforms.uKerrObserverInclination!.value = state.observerInclination;
    (this.material.uniforms.uKerrShadowCenter!.value as Vector2).set(
      state.shadowCenterX,
      state.shadowCenterY,
    );
  }

  dispose(): void {
    for (const name of [
      "uDeflectionTexture",
      "uInverseRadiusTexture",
      "uBlackBodyTexture",
      "uDiskTemperatureTexture",
      "uNoiseTexture",
      "uSkyTexture",
    ]) {
      this.material.uniforms[name]?.value.dispose();
    }
    this.geometry.dispose();
    this.material.dispose();
    this.kerrLensingMap.dispose();
    this.renderer.dispose();
  }
}
