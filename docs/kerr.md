# V2.0 Kerr parameter framework

V2.0 introduces the rotating-vacuum spacetime as a tested CPU model. It intentionally
does not alter the image shader yet. This keeps the scientific boundary explicit:
the spin slider changes derived Kerr quantities, while the rendered rays remain the
validated Schwarzschild rays until V2.1.

## Units and sign convention

The dimensionless spin is

\[
a_* = \frac{Jc}{GM^2}, \qquad -0.998 \le a_* \le 0.998.
\]

The disk always has positive coordinate angular momentum. Positive `a*` is therefore
prograde (black-hole spin aligned with the disk); negative `a*` is retrograde. Public
radii use `r_s = 2GM/c^2 = 2M`. Standard Kerr formulas written in `M` units are
divided by two before being displayed.

The `0.998` cap is the conventional Thorne thin-disk limit and also avoids making an
extremal, coordinate-singular endpoint part of the interactive contract.

## Horizons and ergosphere

In Schwarzschild-radius units, the Boyer–Lindquist horizons are

\[
\frac{r_\pm}{r_s}=\frac{1\pm\sqrt{1-a_*^2}}{2}.
\]

The outer stationary-limit surface is

\[
\frac{r_{static}(\theta)}{r_s}
=\frac{1+\sqrt{1-a_*^2\cos^2\theta}}{2}.
\]

It meets the outer horizon at the poles and remains at `1 r_s` on the equator.
The equatorial ergosphere width displayed by the UI is therefore `1 - r_+/r_s`.

The horizon angular velocity is reported in dimensionless geometrized form:

\[
\Omega_H M = \frac{a_*}{2(1+\sqrt{1-a_*^2})}.
\]

This is a property of the null horizon generator. It is not an instruction to rotate
a visible surface: a black hole has no material sphere or texture at the horizon.

## Equatorial photon orbit

For the equatorial photon orbit moving in the disk's positive direction,

\[
\frac{r_{ph}}{r_s}
=1+\cos\left[\frac{2}{3}\arccos(-a_*)\right].
\]

It moves inward for positive/prograde spin and outward for negative/retrograde spin.
For generic camera inclination, Kerr has a photon region rather than one spherical
photon surface; the V2.0 readout is specifically the disk-plane circular anchor.

## Disk-aligned ISCO

The Bardeen–Press–Teukolsky auxiliary quantities are

\[
Z_1=1+(1-a_*^2)^{1/3}
\left[(1+a_*)^{1/3}+(1-a_*)^{1/3}\right],
\]

\[
Z_2=\sqrt{3a_*^2+Z_1^2}.
\]

For the fixed positive disk orbit,

\[
\frac{r_{ISCO}}{r_s}=\frac{1}{2}
\left[3+Z_2-\operatorname{sgn}(a_*)
\sqrt{(3-Z_1)(3+Z_1+2Z_2)}\right].
\]

The sign is applied once: positive spin selects the prograde branch, while negative
spin selects the retrograde branch. This is covered by endpoint tests to prevent a
visually plausible but physically reversed slider.

## Circular energy, frequency, and efficiency

Let `x = r/M = 2r/r_s`. A positive-sense equatorial circular orbit has

\[
E=\frac{x^{3/2}-2x^{1/2}+a_*}
{x^{3/4}\sqrt{x^{3/2}-3x^{1/2}+2a_*}},
\]

\[
\Omega M=\frac{1}{x^{3/2}+a_*}.
\]

The zero-torque thin-disk radiative efficiency shown by V2.0 is

\[
\eta(a_*)=1-E(r_{ISCO},a_*).
\]

At zero spin, the implementation returns the existing Schwarzschild anchors exactly:
`r_+ = 1 r_s`, `r_ph = 1.5 r_s`, `r_ISCO = 3 r_s`, and
`eta = 1 - sqrt(8/9)`.

## Version boundary

- **V2.0:** CPU Kerr invariants, signed-spin UI, documentation, and regression tests.
- **V2.1:** Kerr null geodesics, frame dragging, shadow displacement/asymmetry, and higher-order images.
- **V2.2:** spin-dependent Novikov–Thorne flux, Kerr emitter four-velocity, redshift, Doppler beaming, and inner disk edge.

Until V2.1, changing `a*` must not change the canvas. Until V2.2, it must not change
the disk spectrum or inner edge. This is a deliberate guard against mixing a Kerr
label with Schwarzschild ray paths.

## Primary references

1. Roy Kerr, [*Gravitational Field of a Spinning Mass as an Example of Algebraically Special Metrics*](https://doi.org/10.1103/PhysRevLett.11.237), 1963.
2. James Bardeen, William Press, and Saul Teukolsky, [*Rotating Black Holes: Locally Nonrotating Frames, Energy Extraction, and Scalar Synchrotron Radiation*](https://ui.adsabs.harvard.edu/abs/1972ApJ...178..347B/abstract), 1972.
3. Kip Thorne, [*Disk-Accretion onto a Black Hole. II. Evolution of the Hole*](https://doi.org/10.1086/152991), 1974.
