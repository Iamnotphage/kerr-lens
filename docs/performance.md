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
- no compulsory post-processing chain.

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

## Future work

- GPU timer queries where `EXT_disjoint_timer_query_webgl2` is available;
- an automated benchmark route with fixed camera and animation time;
- RG16F lookup-table error study to test whether halving lookup bandwidth is safe;
- shader variants that compile out disabled disk/sky branches;
- WebGPU/TSL backend after parity images and numerical tolerances are defined.
