# Kerr parameter and V2.1 lensing model

V2.0 introduced the rotating-vacuum spacetime as a tested CPU model. V2.1 now
propagates non-zero signed spin through a cached null-geodesic transfer map while
preserving the validated Schwarzschild renderer as the exact `a* = 0` path.

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

## V2.1 observer and ray constants

The non-zero-spin camera is a zero-angular-momentum observer (ZAMO) at finite
Boyer–Lindquist radius. In standard `M = 1` units,

\[
\Sigma=r^2+a^2\cos^2\theta,\qquad
\Delta=r^2-2r+a^2,
\]

\[
A=(r^2+a^2)^2-a^2\Delta\sin^2\theta,
\qquad
\alpha=\sqrt{\frac{\Sigma\Delta}{A}},
\qquad
\omega=\frac{2ar}{A}.
\]

A normalized local screen ray is transformed through the ZAMO tetrad. Its
future-directed counterpart supplies the conserved ratios

\[
\lambda=\frac{L_z}{E},\qquad \eta=\frac{Q}{E^2}.
\]

The fragment map then traces the same curve backward from the camera. This sign
choice matters: reversing only the spatial vector rather than the complete null
four-vector gives the wrong frame-dragging direction.

## Carter-separated integration

With Mino parameter `gamma`, the null equations are evaluated from

\[
P=r^2+a^2-a\lambda,
\]

\[
R(r)=P^2-\Delta\left[(\lambda-a)^2+\eta\right],
\]

\[
\Theta(\theta)=\eta+a^2\cos^2\theta-\lambda^2\cot^2\theta.
\]

The implementation integrates `r`, `mu = cos(theta)`, `phi`, and coordinate time.
Using `mu` removes a sine/cosine pair from every step and gives the polynomial

\[
\left(\frac{d\mu}{d\gamma}\right)^2=
\eta+(a^2-\eta-\lambda^2)\mu^2-a^2\mu^4.
\]

Radial and polar signs reverse only at their respective potential turning points.
The first two valid crossings of `mu = 0` become ordered thin-disk intersections;
an escaped ray stores its asymptotic sky direction. A fixed 224-step midpoint
integrator runs only when the transfer map is invalidated, not in steady-state
animation frames.

## Exact critical curve

For an unstable spherical photon orbit at `r` in `M` units, V2.1 independently
evaluates

\[
\lambda(r)=\frac{r^2(r-3)+a^2(r+1)}{a(1-r)},
\]

\[
\eta(r)=\frac{r^3\left[4a^2-r(r-3)^2\right]}
{a^2(r-1)^2}.
\]

These constants are projected through the same finite-radius ZAMO tetrad and
rasterized into a one-dimensional polar boundary texture. The display shader uses
that profile for the capture boundary, while the two-dimensional geodesic map
supplies continuous sky and disk coordinates. This prevents map interpolation from
turning the shadow into a visibly soft or polygonal approximation.

## V2.1 / V2.2 boundary

- **V2.0:** CPU Kerr invariants, signed-spin UI, documentation, and regression tests.
- **V2.1:** finite-observer Kerr null geodesics, frame dragging, exact critical curve, and cached disk/sky transfer.
- **V2.2:** spin-dependent Novikov–Thorne flux, Kerr emitter four-velocity, redshift, Doppler beaming, and inner disk edge.

V2.1 intentionally retains the zero-spin Page–Thorne surface flux, `3 r_s` inner
edge, and Schwarzschild circular emitter. The displayed frequency transfer combines
the Kerr photon constants and ZAMO receiver with that existing emitter. V2.2 replaces
this mixed, explicitly versioned boundary with the complete Kerr disk model.

## Primary references

1. Roy Kerr, [*Gravitational Field of a Spinning Mass as an Example of Algebraically Special Metrics*](https://doi.org/10.1103/PhysRevLett.11.237), 1963.
2. James Bardeen, William Press, and Saul Teukolsky, [*Rotating Black Holes: Locally Nonrotating Frames, Energy Extraction, and Scalar Synchrotron Radiation*](https://ui.adsabs.harvard.edu/abs/1972ApJ...178..347B/abstract), 1972.
3. Kip Thorne, [*Disk-Accretion onto a Black Hole. II. Evolution of the Hole*](https://doi.org/10.1086/152991), 1974.
