# Kerr Lens

A performance-first, physically grounded black-hole renderer for the web.

Version 2.1 makes signed Kerr spin part of the image. A finite-radius ZAMO camera launches rays into a cached, Carter-separated Kerr geodesic map; the exact Kerr critical curve remains sharp at display resolution while frame dragging changes the background and thin-disk intersections. `a* = 0` still selects the original validated Schwarzschild lookup path exactly. V2.0.1's finite-coherence turbulence remains in place, so differential rotation cannot wind a frozen texture into artificial concentric rings.

## Why this is different

Most browser black-hole demos bend a straight ray with an inverse-square force or distort the finished image in screen space. Kerr Lens V1 instead uses the precomputed beam-tracing method from Eric Bruneton's 2020 paper, [*Real-time High-Quality Rendering of Non-Rotating Black Holes*](https://arxiv.org/abs/2010.08735).

At `a* = 0`, every display pixel follows the original constant-time Schwarzschild path:

1. constructs a ray in a static observer's Schwarzschild tetrad;
2. obtains its geodesic deflection and disk intersections from validated lookup tables;
3. maps the escaped ray onto the celestial sphere;
4. samples either an exact Schwarzschild Page–Thorne flux profile or the clearly labelled 4500 K cinematic material;
5. applies gravitational plus orbital Doppler frequency shift at emission; and
6. converts HDR radiance to the display with an explicit exposure and ACES-style tone map.

For non-zero spin, V2.1 constructs the arriving photon in a locally non-rotating
observer tetrad, derives `E`, `Lz`, and Carter's `Q`, and integrates the separated
Kerr equations into three compact transfer attachments. This map is regenerated only
after spin, inclination, distance, or viewport aspect changes. Animation frames sample
the cached sky and two ordered disk hits in constant time; the 224-step integration loop
is not in the steady-state frame path.

V2.1.1 sizes the physical-GPU transfer map from the selected drawing resolution, bounded
to `512–1024` pixels on its long edge. It also removes the former six-column axial
crossfade and limits the photographic longitude repair to the two texels on either side
of the wrap. Periodic longitude derivatives are explicitly unwrapped before mip selection,
preventing close views from magnifying those sampling repairs into false nested bands.

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

Open `?benchmark=1` to run the validation benchmark on the current browser. It discards
90 warm-up frames, samples 600 steady-state frames by default, and reports median,
p95, and p99 frame intervals with GPU and drawing-buffer metadata. Use
`?benchmark=1&frames=1200` for a longer run and copy the JSON report from the panel.

## Controls

- Drag to orbit the observer while keeping the black hole centered.
- Scroll to change the observer radius.
- Select Kerr or Schwarzschild spacetime explicitly. Schwarzschild fixes `a* = 0`; returning to Kerr restores the previous signed spin.
- Vary signed Kerr spin `a*` from `-0.998` (retrograde relative to the disk) to `+0.998` (prograde).
- Inspect spin-derived horizon, ergosphere, photon-orbit, ISCO, efficiency, and horizon-angular-velocity values while the same signed spin drives the V2.1 lens map.
- Switch between the default cinematic presentation and the scientific Page–Thorne disk.
- Adjust inclination, distance, black-hole mass, Eddington luminosity ratio, and display exposure.
- Peak effective and color temperatures are derived outputs, not artistic temperature controls.
- Toggle the disk, relativistic frequency shift, background sky, and animation. The cinematic preset disables frequency shift by default, matching the final film presentation; the scientific preset enables it.
- Select adaptive, performance, balanced, or high-fidelity render resolution; high fidelity is the default.

Mass and Eddington ratio are logarithmic controls spanning `10⁷–10¹⁰ M☉` and `0.01–0.316 L_Edd`. Distances use the Schwarzschild radius, `r_s = 2GM/c²`, as the unit. The V2.0 Kerr anchors are:

| Signed spin | Outer horizon | Disk photon orbit | Disk ISCO | NT efficiency |
| ---: | ---: | ---: | ---: | ---: |
| `-0.998` | `0.531607 r_s` | `1.999111 r_s` | `4.497187 r_s` | `3.777%` |
| `0` | `1 r_s` | `1.5 r_s` | `3 r_s` | `5.719%` |
| `+0.998` | `0.531607 r_s` | `0.536955 r_s` | `0.618485 r_s` | `32.099%` |

## Performance design

- One oversized full-screen triangle; no scene meshes or depth buffer.
- Constant-time steady-state shading through either the Schwarzschild tables or cached Kerr transfer map.
- One display pass and draw call in steady state; by default a parameter change performs its offscreen MRT map update on the next displayed frame.
- Physical-GPU Kerr maps track the selected drawing resolution up to a bounded 1024-pixel long edge; this increases rebuild work, not animation-frame samples.
- The radial Page–Thorne temperature calculation is precomputed once into a 1 KiB `R32F` profile.
- Both materials share two small, mipmapped noise samples per visible disk hit. Broad and fine turbulence are packed into separate texture channels, so two finite-age fields can be blended continuously without increasing the V2.0 sample count. There is no particle loop, extra pass, or extra draw call.
- High-performance WebGL context and no MSAA.
- Dragging never changes the selected quality or lens model; an invalidated Kerr map is rebuilt synchronously before the next displayed frame.
- Adaptive mode targets 60 fps using an exponential moving average of frame time.
- Device pixel ratio is capped to avoid accidental 4K-class rendering on dense displays.
- A 2048×1024 Milky Way panorama is loaded once and sampled with mipmapping plus capped `8:1` hardware anisotropy (284 KiB compressed), preventing elongated lens footprints from becoming broad artificial ribbons.

See [docs/performance.md](docs/performance.md) for budgets and measurement rules.
See [docs/validation.md](docs/validation.md) for the numerical oracle, visual matrix,
and regression policy.
See [docs/kerr.md](docs/kerr.md) for the V2.0 equations, sign convention, and renderer boundary.

## Scientific scope and limitations

V1 is a physically grounded renderer of a specific model, not a prediction of one named astronomical object. Its two appearance modes are intentionally labelled because they answer different questions.

- **Scientific · NT** uses the Page–Thorne temperature profile, color hardening, relativistic frequency shift, and an optically thick photosphere.
- **Cinematic · DNGR** keeps the selected Kerr or Schwarzschild geodesics but uses an art-directed 4500 K, marginal-optical-depth surface, an 85° default view, stronger procedural structure, a mild luminance-neutral warm film grade, and no frequency shift by default. It is inspired by the documented production choices for *Interstellar* and is not presented as an accretion-flow prediction.

- At exactly zero spin, light propagation follows the original Schwarzschild null geodesics up to lookup-table interpolation error.
- At non-zero spin, light propagation uses numerically integrated Carter-separated Kerr null geodesics. The finite transfer-map resolution and fixed integration budget are explicit approximation limits; a separately evaluated finite-observer Kerr critical curve keeps the shadow boundary sharp.
- The disk is geometrically thin but optically thick and begins at the Schwarzschild ISCO.
- The one-face surface flux is the relativistic zero-torque Page–Thorne solution. Mass and `L/L_Edd` determine its effective-temperature normalization using the exact zero-spin efficiency `1 - √(8/9) = 5.719%`.
- A fixed scattering-atmosphere hardening factor `f_col = 1.7` uses the diluted-blackbody spectrum `f_col⁻⁴ Bν(f_col T_eff)`.
- Scientific mode treats procedural motion as a surface-brightness perturbation only. Cinematic mode also maps it to optical depth for visible wisps. Neither mode is a fluid/GRMHD simulation.
- The rendered disk is a finite `3–12 r_s` window of a much larger physical disk. Its outer fade is a presentation boundary.
- The background is an ESO photographic panorama for visual context, not a Gaia-calibrated astrometric or photometric dataset.
- The photographic sky uses bounded anisotropic footprint filtering, but does not implement the separate point-star ray-bundle magnification filter from Bruneton/DNGR.
- Exposure and tone mapping are display choices; absolute brightness depends on mass, accretion rate, wavelength band, and instrument.
- V2.1 propagates spin through the light rays and shadow, but the emitting surface still begins at the Schwarzschild ISCO. Spin-dependent Novikov–Thorne flux and the complete Kerr emitter four-velocity begin in V2.2.
- Polarization, finite disk thickness, returning radiation, limb darkening, magnetic stress, and GRMHD flow remain out of scope.

These boundaries are intentional and visible in [docs/physics.md](docs/physics.md).

## Roadmap

- **V1 — Schwarzschild:** constant-time beam tracing, relativistic thin disk, performance governor, analytic anchors.
- **V1.1 — accretion flow:** seamless domain-warped turbulence, differential rotation, and coupled thermal/opacity structure without particles or additional passes.
- **V1.2 — physical thermal disk:** exact Schwarzschild Page–Thorne flux, mass/accretion normalization, color hardening, and an optically thick surface material.
- **V1.2.1 — appearance calibration:** separate scientific and DNGR-inspired cinematic materials without particles or another render pass.
- **V1.3 — validation:** independent CPU deflection oracle, six-view browser evidence matrix, and exportable frame-time distributions.
- **V2.0 — Kerr framework:** tested spin-dependent horizons, ergosphere, equatorial photon orbits, ISCO, orbital frequency, and radiative efficiency, with an exact `a* = 0` Schwarzschild regression.
- **V2.1 — Kerr lensing:** cached Kerr null geodesics, finite-observer critical curve, frame dragging, and signed-spin image regression.
- **V2.2 — Kerr thin disk:** spin-dependent Novikov–Thorne emission and emitter frequency shift.

EHT-style optically thin plasma and GRMHD rendering are intentionally outside the
current thin-disk roadmap.

## Attribution and license

The project source is MIT licensed. The beam-tracing functions and precomputed assets are adapted from [Eric Bruneton's BSD-3-Clause project](https://github.com/ebruneton/black_hole_shader). The Milky Way panorama is credited to ESO/S. Brunier and used under CC BY 4.0. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for the complete notices.
