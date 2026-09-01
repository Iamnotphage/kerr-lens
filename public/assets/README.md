# Render assets

## Physics lookup data

These files come from the compiled demo of Eric Bruneton's [`black_hole_shader`](https://github.com/ebruneton/black_hole_shader) project and are redistributed under its BSD-3-Clause license.

| File | Purpose | SHA-256 |
| --- | --- | --- |
| `deflection.dat` | 512×512 RG32F ray deflection and coordinate-time table | `1080f45a12fba81321771c2071f4a31795444b110833f61384a9bdf7d057c19d` |
| `inverse_radius.dat` | 64×32 RG32F inverse-radius and coordinate-time table | `7fa22a9270e61f2842c97fb1a9398bcb13e1a965ad39b0f73169354a0d608b04` |
| `black_body.dat` | 128-sample CIE/Planck linear-sRGB radiance table | `aac8ed78dde66d9b44da8b65142429470c89b5edeb74a8fde8dfc000777a2d97` |
| `noise_texture.png` | Procedural accretion-flow density input | `7ba6d84ad14496b6299b57dbbc75b400fad4e9ab022dcacfc7f3fa3751009ed9` |

The first two floats in each ray table encode its width and height. Remaining values are little-endian 32-bit floats.

## Celestial background

| File | Purpose | SHA-256 |
| --- | --- | --- |
| `milky-way.webp` | 2048×1024 equirectangular Milky Way panorama | `7616eaf775537159bddef8ab7b5ebb3bb5b2e1c6c9c908cffd0b95512d9596ab` |

Source: [The Milky Way panorama](https://www.eso.org/public/images/eso0932a/). Credit: ESO/S. Brunier. The repository copy is a downsampled, WebP-compressed adaptation distributed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
