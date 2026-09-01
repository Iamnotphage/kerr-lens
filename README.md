# Kerr Lens

A performance-first, physically grounded black-hole renderer for the web.

Version 1.3 renders a numerically validated, non-rotating Schwarzschild black hole with two explicitly separated disk presentations: a physically normalized Novikov–Thorne/Page–Thorne thermal disk and a default DNGR-inspired cinematic preset. The project name reflects the destination: a validated Kerr renderer. Schwarzschild is the zero-spin (`a* = 0`) member of that family.

## Why this is different

Most browser black-hole demos bend a straight ray with an inverse-square force or distort the finished image in screen space. Kerr Lens V1 instead uses the precomputed beam-tracing method from Eric Bruneton's 2020 paper, [*Real-time High-Quality Rendering of Non-Rotating Black Holes*](https://arxiv.org/abs/2010.08735).

For every pixel, the shader:

1. constructs a ray in a static observer's Schwarzschild tetrad;
2. obtains its geodesic deflection and disk intersections from validated lookup tables;
3. maps the escaped ray onto the celestial sphere;
4. samples either an exact Schwarzschild Page–Thorne flux profile or the clearly labelled 4500 K cinematic material;
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

`check` runs the analytic/unit tests, an independent CPU geodesic oracle,
physics-asset integrity checks, TypeScript validation, and a production build.
CI additionally launches Chromium with software WebGL, compiles the GLSL program,
exercises the controls, captures a six-view validation matrix, runs a fixed-scene
frame benchmark, and saves the evidence as a workflow artifact.

Open `?benchmark=1` to run the V1.3 benchmark on the current browser. It discards
90 warm-up frames, samples 600 steady-state frames by default, and reports median,
p95, and p99 frame intervals with GPU and drawing-buffer metadata. Use
`?benchmark=1&frames=1200` for a longer run and copy the JSON report from the panel.

## Controls

- Drag to orbit the observer while keeping the black hole centered.
- Scroll to change the observer radius.
- Switch between the default cinematic presentation and the scientific Page–Thorne disk.
- Adjust inclination, distance, black-hole mass, Eddington luminosity ratio, and display exposure.
- Peak effective and color temperatures are derived outputs, not artistic temperature controls.
- Toggle the disk, relativistic frequency shift, background sky, and animation. The cinematic preset disables frequency shift by default, matching the final film presentation; the scientific preset enables it.
- Select adaptive, performance, balanced, or high-fidelity render resolution.

Mass and Eddington ratio are logarithmic controls spanning `10⁷–10¹⁰ M☉` and `0.01–0.316 L_Edd`. Distances use the Schwarzschild radius, `r_s = 2GM/c²`, as the unit. In V1.3:

| Quantity | Radius |
| --- | ---: |
| Event horizon | `1 r_s` |
| Photon sphere | `1.5 r_s` |
| Critical shadow impact parameter | `3√3/2 ≈ 2.598 r_s` |
| Innermost stable circular orbit (ISCO) | `3 r_s` |
| Page–Thorne surface-flux maximum | `4.77546 r_s` |

## Performance design

- One oversized full-screen triangle; no scene meshes or depth buffer.
- Constant-time beam tracing through two small floating-point lookup textures.
- A single render pass with no mandatory bloom chain.
- The radial Page–Thorne temperature calculation is precomputed once into a 1 KiB `R32F` profile.
- Both materials share two cached noise samples per visible disk hit; there is no particle loop. The cinematic material maps the same field to emissivity and optical depth, so it adds no texture fetches.
- High-performance WebGL context and no MSAA.
- Render resolution drops temporarily during interaction.
- Adaptive mode targets 60 fps using an exponential moving average of frame time.
- Device pixel ratio is capped to avoid accidental 4K-class rendering on dense displays.
- A 2048×1024 Milky Way panorama is loaded once and sampled as a mipmapped texture (284 KiB compressed).

See [docs/performance.md](docs/performance.md) for budgets and measurement rules.
See [docs/validation.md](docs/validation.md) for the numerical oracle, visual matrix,
and regression policy.

## Scientific scope and limitations

V1 is a physically grounded renderer of a specific model, not a prediction of one named astronomical object. Its two appearance modes are intentionally labelled because they answer different questions.

- **Scientific · NT** uses the Page–Thorne temperature profile, color hardening, relativistic frequency shift, and an optically thick photosphere.
- **Cinematic · DNGR** keeps the same Schwarzschild geodesics but uses an art-directed 4500 K, marginal-optical-depth surface, an 85° default view, stronger procedural structure, a mild luminance-neutral warm film grade, and no frequency shift by default. It is inspired by the documented production choices for *Interstellar* and is not presented as an accretion-flow prediction.

- Light propagation follows Schwarzschild null geodesics up to lookup-table interpolation error.
- The disk is geometrically thin but optically thick and begins at the Schwarzschild ISCO.
- The one-face surface flux is the relativistic zero-torque Page–Thorne solution. Mass and `L/L_Edd` determine its effective-temperature normalization using the exact zero-spin efficiency `1 - √(8/9) = 5.719%`.
- A fixed scattering-atmosphere hardening factor `f_col = 1.7` uses the diluted-blackbody spectrum `f_col⁻⁴ Bν(f_col T_eff)`.
- Scientific mode treats procedural motion as a surface-brightness perturbation only. Cinematic mode also maps it to optical depth for visible wisps. Neither mode is a fluid/GRMHD simulation.
- The rendered disk is a finite `3–12 r_s` window of a much larger physical disk. Its outer fade is a presentation boundary.
- The background is an ESO photographic panorama for visual context, not a Gaia-calibrated astrometric or photometric dataset.
- The star-texture filtering does not implement the full ray-bundle magnification filter from DNGR.
- Exposure and tone mapping are display choices; absolute brightness depends on mass, accretion rate, wavelength band, and instrument.
- V1.3 has no spin, frame dragging, polarization, finite disk thickness, returning radiation, limb darkening, magnetic stress, or GRMHD flow.

These boundaries are intentional and visible in [docs/physics.md](docs/physics.md).

## Roadmap

- **V1 — Schwarzschild:** constant-time beam tracing, relativistic thin disk, performance governor, analytic anchors.
- **V1.1 — accretion flow:** seamless domain-warped turbulence, differential rotation, and coupled thermal/opacity structure without particles or additional passes.
- **V1.2 — physical thermal disk:** exact Schwarzschild Page–Thorne flux, mass/accretion normalization, color hardening, and an optically thick surface material.
- **V1.2.1 — appearance calibration:** separate scientific and DNGR-inspired cinematic materials without particles or another render pass.
- **V1.3 — validation:** independent CPU deflection oracle, six-view browser evidence matrix, and exportable frame-time distributions.
- **V2.0 — Kerr framework:** spin-dependent horizons, ergosphere, equatorial photon orbits, ISCO, orbital frequency, and radiative efficiency, with an exact `a* = 0` Schwarzschild regression.
- **V2.1 — Kerr lensing:** Kerr null geodesics and frame dragging in the image.
- **V2.2 — Kerr thin disk:** spin-dependent Novikov–Thorne emission and emitter frequency shift.

EHT-style optically thin plasma and GRMHD rendering are intentionally outside the
current thin-disk roadmap.

## Attribution and license

The project source is MIT licensed. The beam-tracing functions and precomputed assets are adapted from [Eric Bruneton's BSD-3-Clause project](https://github.com/ebruneton/black_hole_shader). The Milky Way panorama is credited to ESO/S. Brunier and used under CC BY 4.0. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for the complete notices.
