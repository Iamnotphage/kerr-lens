# Performance contract

Kerr Lens treats frame time as a feature, not a cleanup task.

## V1 render budget

The default target is 60 frames per second on an integrated laptop GPU at a balanced internal resolution. A frame should remain within approximately 16.7 ms after shader warm-up. Device, browser, thermal state, and display resolution must accompany every reported result.

The render path is deliberately bounded:

- one draw call;
- one full-screen triangle;
- no depth/stencil attachment;
- no MSAA;
- no per-ray integration loop;
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
- During drag/zoom interaction, scale is temporarily capped at 64%.
- Device pixel ratio is capped at 1.5 before applying the scale.

This changes sampling density, not the physical model.

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
exactly, so the CPU wraps only the GPU flow clock every 2,328 simulation units and avoids
long-running `highp` phase loss without a visible reset. Use the matched-device 5%
median/p95 rule above when judging the added sampling cost.

## Future work

- GPU timer queries where `EXT_disjoint_timer_query_webgl2` is available;
- RG16F lookup-table error study to test whether halving lookup bandwidth is safe;
- shader variants that compile out disabled disk/sky branches;
- WebGPU/TSL backend after parity images and numerical tolerances are defined.
