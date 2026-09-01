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
import type { PhysicsTextures } from "./loadPhysicsTextures";

export interface RendererSettings {
  peakColorTemperature: number;
  spectralDilution: number;
  exposure: number;
  diskEnabled: boolean;
  dopplerEnabled: boolean;
  skyEnabled: boolean;
  paused: boolean;
}

export class BlackHoleRenderer {
  readonly renderer: WebGLRenderer;

  private readonly canvas: HTMLCanvasElement;
  private readonly scene = new Scene();
  private readonly camera = new Camera();
  private readonly material: RawShaderMaterial;
  private readonly geometry: BufferGeometry;
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
        uTime: { value: 0 },
        uExposure: { value: settings.exposure },
        uDiskPeakTemperature: { value: settings.peakColorTemperature },
        uSpectralDilution: { value: settings.spectralDilution },
        uDiskEnabled: { value: settings.diskEnabled ? 1 : 0 },
        uDopplerEnabled: { value: settings.dopplerEnabled ? 1 : 0 },
        uSkyEnabled: { value: settings.skyEnabled ? 1 : 0 },
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
  }

  updateObserver(state: ObserverState): void {
    const observer = staticObserver(state.radius, state.inclination, state.azimuth, this.simulationTime);
    (this.material.uniforms.uCameraCoordinates?.value as Vector4).fromArray(observer.coordinates);
    (this.material.uniforms.uCameraPosition?.value as Vector3).fromArray(observer.position);
    (this.material.uniforms.uCameraFourVelocity?.value as Vector4).fromArray(observer.fourVelocity);
    (this.material.uniforms.uCameraTimeAxis?.value as Vector3).fromArray(observer.timeAxis);
    (this.material.uniforms.uCameraRightAxis?.value as Vector3).fromArray(observer.rightAxis);
    (this.material.uniforms.uCameraUpAxis?.value as Vector3).fromArray(observer.upAxis);
    (this.material.uniforms.uCameraOutwardAxis?.value as Vector3).fromArray(observer.outwardAxis);
  }

  updateSettings(settings: Partial<RendererSettings>): void {
    this.settings = { ...this.settings, ...settings };
    if (settings.peakColorTemperature !== undefined) {
      this.material.uniforms.uDiskPeakTemperature!.value = settings.peakColorTemperature;
    }
    if (settings.spectralDilution !== undefined) {
      this.material.uniforms.uSpectralDilution!.value = settings.spectralDilution;
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
  }

  render(deltaSeconds: number, observer: ObserverState): void {
    if (!this.settings.paused) this.simulationTime += Math.min(deltaSeconds, 0.05) * 7.5;
    this.material.uniforms.uTime!.value = this.simulationTime;
    this.updateObserver(observer);
    this.renderer.render(this.scene, this.camera);
  }

  getDrawingBufferSize(): Vector2 {
    return this.renderer.getDrawingBufferSize(new Vector2());
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
    this.renderer.dispose();
  }
}
