# V1.3+ validation contract

V1.3 separates numerical correctness, image review, and performance measurement.
No single screenshot or FPS number is treated as evidence for all three.

## Independent geodesic oracle

For a Schwarzschild scattering ray arriving from infinity, `u = 1/r` and
`e = 1/b` obey

\[
\left(\frac{du}{d\phi}\right)^2=e^2-u^2(1-u).
\]

The validation code finds the outer turning point by bisection rather than using
the renderer's closed-form apsis mapping. It then evaluates the half orbit with
composite Simpson integration after applying

\[
u=u_{apsis}(1-s^2),
\]

which removes the square-root singularity at the turning point. The full
deflection is `2 phi_half - pi`.

The test independently checks the two-term weak-field limit

\[
\Delta\phi=\frac{2}{b}+\frac{15\pi}{16b^2}+O(b^{-3})
\]

in Schwarzschild-radius units. It also samples the shipped `RG32F` lookup table
at `b = 2.7, 3, 4, 6, 10, 20, 100 r_s`. Every stored apsis angle must remain
within `3×10^-5 rad` of the CPU integral.

## Browser evidence matrix

GitHub Actions renders both **Cinematic · DNGR** and **Scientific · NT** at three
fixed inclinations:

| Inclination | Primary failure exposed |
| ---: | --- |
| `8°` | angular wrap seams and radial wedges |
| `45°` | disk intersection ordering and center coverage |
| `85°` | higher-order image continuity and edge-on clipping |

Animation is paused and render quality is fixed to balanced before capture. The six
PNGs are uploaded with every CI run. They are deliberately review artifacts rather
than tolerant pixel snapshots: GPU transcendental functions and texture filtering
can differ slightly across WebGL implementations.

## Performance evidence

The `?benchmark=1` mode discards warm-up frames and exports a fixed-length frame-time
distribution. CI uses a shorter smoke sample to verify the instrumentation, one-draw
call contract, and JSON schema. Publishable comparisons should use at least 600 frames
on the same physical device and environment.

## V2.0 Kerr regression

The Kerr unit suite pins the signed-spin endpoints `a* = ±0.998`, verifies that the
horizons are even in spin, checks that the equatorial static limit remains `1 r_s`,
and tests prograde/retrograde photon-orbit, ISCO, energy, angular-velocity, and
radiative-efficiency anchors. At `a* = 0`, every radius shared with the renderer is
required to equal the existing Schwarzschild constant exactly, not merely within a
floating-point tolerance.

Run all local non-browser gates with:

```bash
npm run check
```

Run Chromium rendering, the evidence matrix, and benchmark instrumentation with:

```bash
npm run test:e2e
```
