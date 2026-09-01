# Kerr Lens

A performance-first, physically grounded black-hole renderer for the web.

Version 1 renders a non-rotating Schwarzschild black hole with a thin accretion disk. The project name reflects the destination: a validated Kerr renderer. Schwarzschild is the zero-spin (`a* = 0`) member of that family.

## Why this is different

Most browser black-hole demos bend a straight ray with an inverse-square force or distort the finished image in screen space. Kerr Lens V1 instead uses the precomputed beam-tracing method from Eric Bruneton's 2020 paper, [*Real-time High-Quality Rendering of Non-Rotating Black Holes*](https://arxiv.org/abs/2010.08735).

For every pixel, the shader:

1. constructs a ray in a static observer's Schwarzschild tetrad;
2. obtains its geodesic deflection and disk intersections from validated lookup tables;
3. maps the escaped ray onto the celestial sphere;
4. shades the disk with a zero-torque thin-disk temperature profile;
5. applies gravitational plus orbital Doppler frequency shift at emission; and
6. converts HDR radiance to the display with an explicit exposure and ACES-style tone map.

The geodesic query has constant cost per pixel. There is no 64–1024 iteration ray-march loop in the render path.

## Run locally

Requirements: Node.js 24 or newer.

```bash
npm install
npm run dev
```

Then open the URL printed by Vite.

```bash
npm run check
```

`check` runs the analytic/unit tests, physics-asset integrity checks, TypeScript
validation, and a production build.
CI additionally launches Chromium with software WebGL, compiles the GLSL program,
exercises the controls, and saves a rendered screenshot as a workflow artifact.

## Controls

- Drag to orbit the observer while keeping the black hole centered.
- Scroll to change the observer radius.
- Adjust inclination, distance, peak disk temperature, and display exposure.
- Toggle the disk, relativistic frequency shift, background sky, and animation.
- Select adaptive, performance, balanced, or high-fidelity render resolution.

Distances use the Schwarzschild radius, `r_s = 2GM/c²`, as the unit. In V1:

| Quantity | Radius |
| --- | ---: |
| Event horizon | `1 r_s` |
| Photon sphere | `1.5 r_s` |
| Critical shadow impact parameter | `3√3/2 ≈ 2.598 r_s` |
| Innermost stable circular orbit (ISCO) | `3 r_s` |

## Performance design

- One oversized full-screen triangle; no scene meshes or depth buffer.
- Constant-time beam tracing through two small floating-point lookup textures.
- A single render pass with no mandatory bloom chain.
- High-performance WebGL context and no MSAA.
- Render resolution drops temporarily during interaction.
- Adaptive mode targets 60 fps using an exponential moving average of frame time.
- Device pixel ratio is capped to avoid accidental 4K-class rendering on dense displays.
- A 2048×1024 Milky Way panorama is loaded once and sampled as a mipmapped texture (284 KiB compressed).

See [docs/performance.md](docs/performance.md) for budgets and measurement rules.

## Scientific scope and limitations

V1 is a physically grounded renderer of a specific model, not a prediction of one named astronomical object.

- Light propagation follows Schwarzschild null geodesics up to lookup-table interpolation error.
- The disk is geometrically and optically thin and begins at the Schwarzschild ISCO.
- Disk temperature follows the standard zero-torque radial profile, while small-scale density texture is procedural.
- The background is an ESO photographic panorama for visual context, not a Gaia-calibrated astrometric or photometric dataset.
- The star-texture filtering does not implement the full ray-bundle magnification filter from DNGR.
- Exposure and tone mapping are display choices; absolute brightness depends on mass, accretion rate, wavelength band, and instrument.
- V1 has no spin, frame dragging, polarization, volumetric transfer, magnetic field, or GRMHD flow.

These boundaries are intentional and visible in [docs/physics.md](docs/physics.md).

## Roadmap

- **V1 — Schwarzschild:** constant-time beam tracing, relativistic thin disk, performance governor, analytic anchors.
- **V1.1 — validation:** golden-image comparisons against the reference renderer and browser GPU benchmarks.
- **V2 — Kerr:** spin-dependent horizon, photon region and ISCO; Kerr null geodesics; frame dragging.
- **V3 — radiative transfer:** optically thin volume emission/absorption and optional scientific datasets.

## Attribution and license

The project source is MIT licensed. The beam-tracing functions and precomputed assets are adapted from [Eric Bruneton's BSD-3-Clause project](https://github.com/ebruneton/black_hole_shader). The Milky Way panorama is credited to ESO/S. Brunier and used under CC BY 4.0. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for the complete notices.
