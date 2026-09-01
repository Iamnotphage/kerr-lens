import {
  BufferGeometry,
  Camera,
  ClampToEdgeWrapping,
  DataTexture,
  Float32BufferAttribute,
  FloatType,
  GLSL3,
  HalfFloatType,
  LinearFilter,
  Mesh,
  NoBlending,
  NoColorSpace,
  RawShaderMaterial,
  RedFormat,
  RepeatWrapping,
  RGBAFormat,
  Scene,
  Vector2,
  WebGLRenderer,
  WebGLRenderTarget,
} from "three";

import { kerrShadowProfile } from "../physics/kerrLensing";
import fragmentShader from "../shaders/kerr-map.frag.glsl?raw";
import vertexShader from "../shaders/fullscreen.vert.glsl?raw";
import type { ObserverState } from "./ObserverController";

const FOV_Y = (48 * Math.PI) / 180;
const SHADOW_PROFILE_SIZE = 512;
const UPDATE_SETTLE_MS = 55;

function evenDimension(value: number): number {
  const rounded = Math.max(96, Math.round(value));
  return rounded + (rounded & 1);
}

export interface KerrLensingMapState {
  readonly ready: boolean;
  readonly spin: number;
  readonly observerRadius: number;
  readonly observerInclination: number;
  readonly width: number;
  readonly height: number;
  readonly shadowCenterX: number;
  readonly shadowCenterY: number;
  readonly rebuildCount: number;
}

interface RequestedMap {
  spin: number;
  radius: number;
  inclination: number;
}

export class KerrLensingMap {
  readonly target: WebGLRenderTarget;
  readonly shadowTexture: DataTexture;

  private readonly scene = new Scene();
  private readonly camera = new Camera();
  private readonly geometry = new BufferGeometry();
  private readonly material: RawShaderMaterial;
  private readonly resolution = new Vector2(2, 2);
  private readonly shadowData = new Float32Array(SHADOW_PROFILE_SIZE);
  private readonly longEdge: number;
  private requested: RequestedMap = { spin: 0, radius: 26, inclination: Math.PI / 2 };
  private dirty = false;
  private dirtySince = 0;
  private state: KerrLensingMapState = {
    ready: false,
    spin: 0,
    observerRadius: 26,
    observerInclination: Math.PI / 2,
    width: 2,
    height: 2,
    shadowCenterX: 0,
    shadowCenterY: 0,
    rebuildCount: 0,
  };

  constructor(renderer: WebGLRenderer, softwareRenderer: boolean) {
    if (!renderer.extensions.has("EXT_color_buffer_float")) {
      throw new Error("Kerr lens maps require floating-point WebGL 2 render targets.");
    }
    this.longEdge = softwareRenderer ? 224 : 512;
    this.target = new WebGLRenderTarget(2, 2, {
      count: 3,
      format: RGBAFormat,
      type: HalfFloatType,
      minFilter: LinearFilter,
      magFilter: LinearFilter,
      wrapS: ClampToEdgeWrapping,
      wrapT: ClampToEdgeWrapping,
      generateMipmaps: false,
      depthBuffer: false,
      stencilBuffer: false,
    });
    this.target.textures.forEach((texture, index) => {
      texture.name = ["Kerr sky transfer", "Kerr disk hit 0", "Kerr disk hit 1"][index] ??
        `Kerr transfer ${index}`;
      texture.colorSpace = NoColorSpace;
    });

    this.shadowData.fill(1);
    this.shadowTexture = new DataTexture(
      this.shadowData,
      SHADOW_PROFILE_SIZE,
      1,
      RedFormat,
      FloatType,
    );
    this.shadowTexture.name = "Finite-observer Kerr critical curve";
    this.shadowTexture.colorSpace = NoColorSpace;
    this.shadowTexture.minFilter = LinearFilter;
    this.shadowTexture.magFilter = LinearFilter;
    this.shadowTexture.wrapS = RepeatWrapping;
    this.shadowTexture.wrapT = ClampToEdgeWrapping;
    this.shadowTexture.generateMipmaps = false;
    this.shadowTexture.needsUpdate = true;

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
        uFovY: { value: FOV_Y },
        uSpin: { value: 0 },
        uObserverRadiusRs: { value: 26 },
        uObserverInclination: { value: Math.PI / 2 },
      },
    });
    this.geometry.setAttribute(
      "position",
      new Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3),
    );
    const mesh = new Mesh(this.geometry, this.material);
    mesh.frustumCulled = false;
    this.scene.add(mesh);
  }

  resize(viewportWidth: number, viewportHeight: number): boolean {
    const aspect = Math.max(viewportWidth, 1) / Math.max(viewportHeight, 1);
    // Even dimensions keep the measure-zero lambda = 0 / screen-axis ray
    // between texel centers on every viewport orientation.
    const width = aspect >= 1 ? this.longEdge : evenDimension(this.longEdge * aspect);
    const height = aspect >= 1 ? evenDimension(this.longEdge / aspect) : this.longEdge;
    if (width === this.target.width && height === this.target.height) return false;
    this.target.setSize(width, height);
    this.resolution.set(width, height);
    this.state = { ...this.state, width, height, ready: false };
    this.dirty = true;
    this.dirtySince = performance.now();
    return true;
  }

  request(spin: number, observer: ObserverState): boolean {
    const unchanged =
      spin === this.requested.spin &&
      observer.radius === this.requested.radius &&
      observer.inclination === this.requested.inclination;
    if (unchanged) return false;
    this.requested = {
      spin,
      radius: observer.radius,
      inclination: observer.inclination,
    };
    this.dirty = true;
    this.dirtySince = performance.now();
    return true;
  }

  async compile(renderer: WebGLRenderer): Promise<void> {
    await renderer.compileAsync(this.scene, this.camera);
  }

  renderIfNeeded(renderer: WebGLRenderer, force = false): boolean {
    if (!this.dirty) return false;
    if (!force && this.state.ready && performance.now() - this.dirtySince < UPDATE_SETTLE_MS) {
      return false;
    }

    const { spin, radius, inclination } = this.requested;
    if (Math.abs(spin) < 0.0015) {
      this.state = {
        ...this.state,
        ready: false,
        spin: 0,
        observerRadius: radius,
        observerInclination: inclination,
      };
      this.dirty = false;
      return true;
    }

    this.material.uniforms.uSpin!.value = spin;
    this.material.uniforms.uObserverRadiusRs!.value = radius;
    this.material.uniforms.uObserverInclination!.value = inclination;
    const previousTarget = renderer.getRenderTarget();
    renderer.setRenderTarget(this.target);
    renderer.render(this.scene, this.camera);
    renderer.setRenderTarget(previousTarget);

    const shadow = kerrShadowProfile(
      spin,
      radius,
      inclination,
      FOV_Y,
      SHADOW_PROFILE_SIZE,
    );
    this.shadowData.set(shadow.radii);
    this.shadowTexture.needsUpdate = true;
    this.state = {
      ready: true,
      spin,
      observerRadius: radius,
      observerInclination: inclination,
      width: this.target.width,
      height: this.target.height,
      shadowCenterX: shadow.centerX,
      shadowCenterY: shadow.centerY,
      rebuildCount: this.state.rebuildCount + 1,
    };
    this.dirty = false;
    return true;
  }

  getState(): KerrLensingMapState {
    return { ...this.state };
  }

  dispose(): void {
    this.target.dispose();
    this.shadowTexture.dispose();
    this.geometry.dispose();
    this.material.dispose();
  }
}
