# Performance contract

Kerr Lens treats frame time as a feature, not a cleanup task.

## Steady-state render budget

The application defaults to high-fidelity resolution and does not silently reduce quality during interaction. The controlled benchmark uses a balanced internal resolution and targets 60 frames per second on an integrated laptop GPU. A steady-state benchmark frame should remain within approximately 16.7 ms after shader warm-up. Device, browser, thermal state, and display resolution must accompany every reported result.

The render path is deliberately bounded:

- one draw call;
- one full-screen triangle;
- no depth/stencil attachment;
- no MSAA;
- no per-ray integration loop in an animation frame;
- fixed lookup count for lensing and disk intersection;
- at most two disk-shading evaluations;
- one cached Page–Thorne profile lookup and two small, mipmapped noise samples per visible disk hit;
- no compulsory post-processing chain.

The 2048×1024 Milky Way panorama adds 284 KiB to the transfer and approximately 10.7 MiB of GPU memory including mip levels. It replaces the previous CPU-generated sky without adding a render pass or per-frame upload.

V1.2 computes the relativistic temperature curve once on the CPU and uploads a 256×1 `R32F` texture (1 KiB). This replaces per-fragment logarithms and fourth roots with one coherent lookup. V1.2.1 keeps the turbulence field at two samples in both appearance modes. Its cinematic optical-depth transfer is the rational form `τ / (1 + τ)`, avoiding an exponential, particle loop, and post-processing pass. The warm film grade is three constant channel multiplies and adds no texture lookup or render pass.

## Adaptive resolution

Adaptive mode maintains an exponential moving average of frame time.

- Above 18.5 ms, internal resolution decreases in 8% steps.
- Below 14.2 ms, it increases in 4% steps.
- The permitted scale is 52–100% of the capped device resolution.
- Device pixel ratio is capped at 1.5 before applying the scale.

Adaptive scaling only runs when the user explicitly selects Adaptive mode. Dragging itself
never changes sampling density or the physical model.

## Measurement checklist

Benchmark only after the loading layer disappears and at least five seconds of shader warm-up. Record:

1. browser and version;
2. GPU and driver/OS;
3. CSS viewport and drawing-buffer resolution;
4. quality mode and device pixel ratio;
5. median, p95, and p99 frame time over at least 600 frames;
6. disk/sky/shift toggle state;
7. observer radius and inclination.

The on-screen HUD is a live diagnostic based on an EMA, not a publishable benchmark.

## V1.3+ benchmark mode

Append `?benchmark=1` to the application URL to run a controlled browser sample.
The mode fixes balanced render scale and animation time, discards 90 warm-up frames,
then records 600 `requestAnimationFrame` intervals. The report contains median, p95,
p99, mean, minimum and maximum frame time together with:

- unmasked GPU/driver string when the browser exposes it;
- WebGL version;
- CSS device pixel ratio and drawing-buffer dimensions; and
- draw-call and triangle counts.

The panel can copy the complete JSON report. `frames` may be set from 60 to 1200,
for example `?benchmark=1&frames=1200`. Compare only runs with the same browser,
GPU, viewport, device-pixel ratio, quality, and scene. A greater than 5% change in
median or p95 under a matched environment is a regression investigation trigger,
not an automatic proof of a shader regression.

V2.0 evaluates Kerr parameters only when the spin control changes. No Kerr expression,
uniform, texture lookup, or branch was added to the per-pixel render path, so the
one-draw-call shader cost is identical to V1.3.

V2.0.1 replaces the indefinitely sheared frozen turbulence texture with two overlapping,
finite-age fields. Broad and fine noise are prepacked into the R and G channels, so each
field costs one 128×128 mipmapped sample and the disk-shading budget remains two samples
per visible hit. The renderer still uses one full-screen triangle, one pass, and one draw
call. The fields crossfade with zero-slope weights and never exceed two coherence windows
of shear. Their 97-epoch sequence repeats
exactly, so the CPU wraps only the GPU flow clock every 1,164 simulation units and avoids
long-running `highp` phase loss without a visible reset. Use the matched-device 5%
median/p95 rule above when judging the added sampling cost.

## V2.1 cached Kerr transfer

V2.1 does not run a Kerr integrator for every display pixel on every frame. Non-zero
spin uses a three-attachment `RGBA16F` transfer target whose long edge is 512 pixels on
a physical GPU and 224 pixels on a detected software renderer. It stores the escaped sky
direction and the Cartesian positions of the first two ordered equatorial-disk
intersections. Cartesian hit coordinates remain continuous where a wrapped azimuth would
jump by `2π` and create a visible interpolation seam. A 512-sample `R32F`
polar profile independently evaluates the finite-observer Kerr critical curve so its edge
is not limited by the lower-resolution transfer target.

The map does not integrate singular Boyer–Lindquist azimuth directly. It evolves the
Cartesian angular direction, whose derivative stays finite at the spin axis, and folds
midpoint overshoot at the exact Carter polar root. Even transfer dimensions keep the
measure-zero axial ray between texel centers. On invalidation, a six-column MRT pass
reconstructs the remaining undersampled axial footprint and copies it back into the map.
The strip costs about 41 KiB at a 288-pixel map height and adds no display-time branch or
filtering.

Equatorial crossings are retained through a `2.25–14 r_s` guard band around the visible
`3–12 r_s` annulus. The full-resolution display shader evaluates the actual disk edge from
the interpolated Cartesian radius, instead of magnifying a low-resolution hit/no-hit edge.
The photographic sky's non-identical longitude endpoints are likewise crossfaded over a
narrow spherical strip so lensing cannot turn an asset seam into a screen-space cut.

Changing spin, inclination, observer radius, or viewport aspect invalidates the map. By
default, the renderer performs one offscreen MRT draw with a fixed 224-step Carter
integrator plus the six-column repair pass on the next displayed frame. This may stall an
interaction frame, but never substitutes a lower-fidelity lens path, delays the rebuild, or
changes the selected render scale. After the rebuild, rendering returns to the steady-state
contract:

- one display draw call and one full-screen triangle;
- three transfer samples plus one one-dimensional shadow sample at every pixel;
- no geodesic loop, CPU upload, or map allocation per animation frame; and
- approximately 3.4 MiB for a 512×288 three-attachment transfer map, plus 2 KiB for the critical-curve profile.

Map rebuild latency and steady-state frame time are separate measurements. The exported
benchmark begins after shader warm-up and the initial Kerr map build, so median/p95/p99
describe the animation path rather than a parameter-edit event.

## Future work

- GPU timer queries where `EXT_disjoint_timer_query_webgl2` is available;
- RG16F lookup-table error study to test whether halving lookup bandwidth is safe;
- shader variants that compile out disabled disk/sky branches;
- WebGPU/TSL backend after parity images and numerical tolerances are defined.
