/**
 * The precomputed beam-tracing functions in this shader are adapted from:
 *
 *   Eric Bruneton, "Real-time High-Quality Rendering of Non-Rotating Black
 *   Holes", 2020, https://arxiv.org/abs/2010.08735
 *   https://github.com/ebruneton/black_hole_shader
 *
 * Copyright (c) 2020 Eric Bruneton
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 * 1. Redistributions of source code must retain the above copyright notice,
 *    this list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 *    this list of conditions and the following disclaimer in the documentation
 *    and/or other materials provided with the distribution.
 * 3. Neither the name of the copyright holder nor the names of its contributors
 *    may be used to endorse or promote products derived from this software
 *    without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
 * AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
 * ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE
 * LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
 * CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
 * SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
 * INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
 * CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
 * ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
 * POSSIBILITY OF SUCH DAMAGE.
 */

precision highp float;
precision highp int;

layout(location = 0) out vec4 fragmentColor;

uniform vec2 uResolution;
uniform float uFovY;
uniform vec4 uCameraCoordinates;
uniform vec3 uCameraPosition;
uniform vec4 uCameraFourVelocity;
uniform vec3 uCameraTimeAxis;
uniform vec3 uCameraRightAxis;
uniform vec3 uCameraUpAxis;
uniform vec3 uCameraOutwardAxis;

uniform sampler2D uDeflectionTexture;
uniform sampler2D uInverseRadiusTexture;
uniform sampler2D uBlackBodyTexture;
uniform sampler2D uNoiseTexture;
uniform sampler2D uSkyTexture;

uniform float uTime;
uniform float uExposure;
uniform float uDiskTemperature;
uniform float uDiskDensity;
uniform float uDiskOpacity;
uniform int uDiskEnabled;
uniform int uDopplerEnabled;
uniform int uSkyEnabled;

const float PI = 3.14159265358979323846;
const float TAU = 6.28318530717958647692;
const float MU = 4.0 / 27.0;
const float INNER_DISK_RADIUS = 3.0;
const float OUTER_DISK_RADIUS = 12.0;
const int DEFLECTION_WIDTH = 512;
const int DEFLECTION_HEIGHT = 512;
const int INVERSE_RADIUS_WIDTH = 64;
const int INVERSE_RADIUS_HEIGHT = 32;

float unitTextureCoordinate(float value, int size) {
  return 0.5 / float(size) + value * (1.0 - 1.0 / float(size));
}

float deflectionTextureU(float energySquared) {
  if (energySquared < MU) {
    return 0.5 - sqrt(-log(1.0 - energySquared / MU) / 50.0);
  }
  return 0.5 + sqrt(-log(1.0 - MU / energySquared) / 50.0);
}

float apsisInverseRadius(float energySquared) {
  float value = (2.0 / MU) * energySquared - 1.0;
  return 1.0 / 3.0 + (2.0 / 3.0) * sin(asin(value) / 3.0);
}

float deflectionTextureV(float energySquared, float inverseRadius) {
  if (energySquared > MU) {
    float offset = inverseRadius < 2.0 / 3.0
      ? -sqrt(2.0 / 3.0 - inverseRadius)
      : sqrt(inverseRadius - 2.0 / 3.0);
    return (sqrt(2.0 / 3.0) + offset) / (sqrt(2.0 / 3.0) + sqrt(1.0 / 3.0));
  }
  return 1.0 - sqrt(max(1.0 - inverseRadius / apsisInverseRadius(energySquared), 0.0));
}

vec2 lookupDeflection(float energySquared, float inverseRadius, out vec2 atApsis) {
  float textureU = unitTextureCoordinate(deflectionTextureU(energySquared), DEFLECTION_WIDTH);
  float textureV = unitTextureCoordinate(
    deflectionTextureV(energySquared, inverseRadius),
    DEFLECTION_HEIGHT
  );
  float apsisV = unitTextureCoordinate(1.0, DEFLECTION_HEIGHT);
  atApsis = texture(uDeflectionTexture, vec2(textureU, apsisV)).rg;
  return texture(uDeflectionTexture, vec2(textureU, textureV)).rg;
}

float inverseRadiusTextureU(float energySquared) {
  return 1.0 / (1.0 + 6.0 * energySquared);
}

float phiUpperBound(float energySquared) {
  return (1.0 + energySquared) /
    (1.0 / 3.0 + 2.0 * energySquared * sqrt(energySquared));
}

vec2 lookupInverseRadius(float energySquared, float phi) {
  float textureU = unitTextureCoordinate(
    inverseRadiusTextureU(energySquared),
    INVERSE_RADIUS_WIDTH
  );
  float textureV = unitTextureCoordinate(
    phi / phiUpperBound(energySquared),
    INVERSE_RADIUS_HEIGHT
  );
  return texture(uInverseRadiusTexture, vec2(textureU, textureV)).rg;
}

float filteredPulse(float edge0, float edge1, float value, float filterWidth) {
  filterWidth = max(filterWidth, 1e-6);
  float x0 = value - filterWidth * 0.5;
  float x1 = x0 + filterWidth;
  return max(0.0, (min(x1, edge1) - max(x0, edge0)) / filterWidth);
}

/** Constant-time ray deflection and two thin-disk intersection queries. */
float traceRay(
  float inverseRadius,
  float inverseRadiusDerivative,
  float energySquared,
  float delta,
  float alpha,
  float diskInnerU,
  float diskOuterU,
  out float hitU0,
  out float hitPhi0,
  out float hitTime0,
  out float hitCoverage0,
  out float hitU1,
  out float hitPhi1,
  out float hitTime1,
  out float hitCoverage1
) {
  hitU0 = -1.0;
  hitU1 = -1.0;
  hitCoverage0 = 0.0;
  hitCoverage1 = 0.0;

  if (energySquared < MU && inverseRadius > 2.0 / 3.0) return -1.0;

  vec2 deflectionApsis;
  vec2 deflection = lookupDeflection(energySquared, inverseRadius, deflectionApsis);
  float rayDeflection = deflection.x;
  if (inverseRadiusDerivative > 0.0) {
    rayDeflection = energySquared < MU ? 2.0 * deflectionApsis.x - rayDeflection : -1.0;
  }

  float directionSign = sign(inverseRadiusDerivative);
  float phi = deflection.x + (directionSign == 1.0 ? PI - delta : delta) + directionSign * alpha;
  float phiApsis = deflectionApsis.x + PI * 0.5;

  hitPhi0 = mod(phi, PI);
  vec2 inverseRadius0 = lookupInverseRadius(energySquared, hitPhi0);
  if (hitPhi0 < phiApsis) {
    float side = directionSign * (inverseRadius0.x - inverseRadius);
    if (side > 1e-3 || (side > -1e-3 && alpha < delta)) {
      hitU0 = inverseRadius0.x;
      hitPhi0 = alpha + phi - hitPhi0;
      hitTime0 = directionSign * (inverseRadius0.y - deflection.y);
    }
  }

  phi = 2.0 * phiApsis - phi;
  hitPhi1 = mod(phi, PI);
  vec2 inverseRadius1 = lookupInverseRadius(energySquared, hitPhi1);
  if (energySquared < MU && directionSign == 1.0 && hitPhi1 < phiApsis) {
    hitU1 = inverseRadius1.x;
    hitPhi1 = alpha + phi - hitPhi1;
    hitTime1 = 2.0 * deflectionApsis.y - inverseRadius1.y - deflection.y;
  }

  float width0 = min(fwidth(inverseRadius0.x), fwidth(hitU0 == -1.0 ? hitU1 : hitU0));
  float width1 = min(fwidth(inverseRadius1.x), fwidth(hitU1 == -1.0 ? hitU0 : hitU1));
  hitCoverage0 = filteredPulse(diskOuterU, diskInnerU, hitU0, width0);
  hitCoverage1 = filteredPulse(diskOuterU, diskInnerU, hitU1, width1);

  if (directionSign == 1.0 && abs(energySquared - MU) < min(fwidth(energySquared), MU)) {
    float middleU = 2.0 / (1.0 / diskInnerU + 1.0 / diskOuterU);
    if (hitCoverage0 < 0.99) hitU0 = middleU;
    if (hitCoverage1 < 0.99) hitU1 = middleU;
  }
  return rayDeflection;
}

vec2 skyUv(vec3 direction) {
  direction = normalize(direction);
  return vec2(
    atan(direction.z, direction.x) / TAU + 0.5,
    asin(clamp(direction.y, -1.0, 1.0)) / PI + 0.5
  );
}

vec3 skyColor(vec3 direction) {
  if (uSkyEnabled == 0) return vec3(0.001, 0.002, 0.005);
  vec3 color = texture(uSkyTexture, skyUv(direction)).rgb;
  return color * 0.9;
}

vec3 blackBodyRadiance(float temperature) {
  float textureU = clamp(log(max(temperature, 100.0) / 100.0) / 6.0, 0.0, 1.0);
  // Absolute detector exposure is unspecified; this scale places the physical
  // radiance ratios in a useful HDR range before the user exposure control.
  return texture(uBlackBodyTexture, vec2(textureU, 0.5)).rgb * 3e-8;
}

float diskTemperatureProfile(float radius) {
  if (radius <= INNER_DISK_RADIUS) return 0.0;
  const float peakRadius = 49.0 / 12.0;
  float peak = (1.0 - sqrt(INNER_DISK_RADIUS / peakRadius)) /
    (peakRadius * peakRadius * peakRadius);
  float flux = (1.0 - sqrt(INNER_DISK_RADIUS / radius)) /
    (radius * radius * radius);
  return pow(max(flux / peak, 0.0), 0.25);
}

float accretionDensity(float radius, float angle, float coordinateTime) {
  float omega = sqrt(0.5 / (radius * radius * radius));
  float phase = angle - coordinateTime * omega;

  // Advect a continuous Cartesian noise field instead of painting radial
  // sine bands. The logarithmic twist seeds trailing structures while the
  // Keplerian omega shears them at different rates across the disk.
  float spiralPhase = phase + 1.35 * log(radius / INNER_DISK_RADIUS);
  vec2 flowPosition = radius * vec2(cos(spiralPhase), sin(spiralPhase));
  vec2 broadUv = flowPosition * 0.115;

  // Three cache-friendly samples give us domain-warped broad turbulence and
  // thin ridges. There is no particle loop and no extra render pass.
  float warp = texture(uNoiseTexture, broadUv * 0.61 + vec2(0.37, 0.71)).r * 2.0 - 1.0;
  float broad = texture(uNoiseTexture, broadUv + warp * vec2(0.24, -0.19)).r;
  float fine = texture(
    uNoiseTexture,
    broadUv * 3.7 + warp * vec2(-0.53, 0.41) + vec2(0.13, 0.47)
  ).r;

  float ridge = 1.0 - abs(fine * 2.0 - 1.0);
  ridge = ridge * ridge * ridge;
  float cloud = smoothstep(0.16, 0.9, broad);
  return clamp(0.12 + 0.78 * cloud + 0.38 * ridge * cloud, 0.0, 1.18);
}

vec4 diskColor(vec2 position, float coordinateTime, bool topSide, float shiftFactor) {
  if (uDiskEnabled == 0) return vec4(0.0);
  float radius = length(position);
  if (radius <= INNER_DISK_RADIUS || radius >= OUTER_DISK_RADIUS) return vec4(0.0);

  float angle = atan(position.y, position.x);
  float density = accretionDensity(radius, angle, coordinateTime);
  float edge = smoothstep(INNER_DISK_RADIUS, INNER_DISK_RADIUS * 1.06, radius) *
    (1.0 - smoothstep(OUTER_DISK_RADIUS * 0.91, OUTER_DISK_RADIUS, radius));
  float shift = uDopplerEnabled == 1 ? clamp(shiftFactor, 0.18, 4.0) : 1.0;
  float thermalVariation = mix(0.88, 1.08, clamp(density, 0.0, 1.0));
  float temperature = uDiskTemperature * diskTemperatureProfile(radius) * shift * thermalVariation;
  vec3 radiance = blackBodyRadiance(temperature);
  float sideAttenuation = topSide ? 1.0 : 0.82;
  float opticalDepth = edge * uDiskOpacity * (0.25 + 1.1 * uDiskDensity * density);
  float alpha = 1.0 - exp(-opticalDepth);
  float emissivity = alpha * (0.9 + 1.15 * uDiskDensity * density);
  return vec4(radiance * emissivity * sideAttenuation, alpha);
}

vec3 sceneColor(vec3 viewDirection) {
  vec3 q = normalize(viewDirection);
  vec3 photonDirection = -uCameraTimeAxis +
    q.x * uCameraRightAxis +
    q.y * uCameraUpAxis +
    q.z * uCameraOutwardAxis;

  vec3 radialAxis = normalize(uCameraPosition);
  vec3 planeNormalUnnormalized = cross(radialAxis, photonDirection);
  if (dot(planeNormalUnnormalized, planeNormalUnnormalized) < 1e-12) {
    return vec3(0.0);
  }
  vec3 planeNormal = normalize(planeNormalUnnormalized);
  vec3 tangentAxis = normalize(cross(planeNormal, radialAxis));

  const vec3 diskNormal = vec3(0.0, 0.0, 1.0);
  vec3 diskLine = cross(diskNormal, planeNormal);
  if (dot(diskLine, diskLine) < 1e-12) diskLine = tangentAxis;
  diskLine = normalize(diskLine);
  if (dot(diskLine, tangentAxis) < 0.0) diskLine = -diskLine;

  float alpha = acos(clamp(dot(radialAxis, diskLine), -1.0, 1.0));
  float delta = acos(clamp(dot(radialAxis, normalize(photonDirection)), -1.0, 1.0));
  float inverseRadius = 1.0 / uCameraCoordinates.y;
  float inverseRadiusDerivative = -inverseRadius / tan(delta);
  float energySquared = inverseRadiusDerivative * inverseRadiusDerivative +
    inverseRadius * inverseRadius * (1.0 - inverseRadius);
  float energy = -sqrt(energySquared);

  float hitU0;
  float hitPhi0;
  float hitTime0;
  float hitCoverage0;
  float hitU1;
  float hitPhi1;
  float hitTime1;
  float hitCoverage1;
  float deflection = traceRay(
    inverseRadius,
    inverseRadiusDerivative,
    energySquared,
    delta,
    alpha,
    1.0 / INNER_DISK_RADIUS,
    1.0 / OUTER_DISK_RADIUS,
    hitU0,
    hitPhi0,
    hitTime0,
    hitCoverage0,
    hitU1,
    hitPhi1,
    hitTime1,
    hitCoverage1
  );

  vec4 rayMomentum = vec4(
    energy / (1.0 - inverseRadius),
    -inverseRadiusDerivative,
    0.0,
    inverseRadius * inverseRadius
  );
  float receiverDot =
    uCameraFourVelocity.x * rayMomentum.x * (1.0 - inverseRadius) -
    uCameraFourVelocity.y * rayMomentum.y / (1.0 - inverseRadius) -
    inverseRadius * dot(uCameraTimeAxis, tangentAxis) * rayMomentum.w /
      (inverseRadius * inverseRadius);

  float deflectedDelta = delta + max(deflection, 0.0);
  vec3 sourceDirection = cos(deflectedDelta) * radialAxis + sin(deflectedDelta) * tangentAxis;
  vec3 color = deflection >= 0.0 ? skyColor(sourceDirection) : vec3(0.0);

  if (hitU1 >= 0.0 && hitCoverage1 > 0.0) {
    float sourceDot = energy * sqrt(2.0 / (2.0 - 3.0 * hitU1)) -
      hitU1 * sqrt(hitU1 / (2.0 - 3.0 * hitU1)) * dot(diskNormal, planeNormal);
    float shift = receiverDot / sourceDot;
    bool topSide = (mod(abs(hitPhi1 - alpha), TAU) < 1e-3) == (radialAxis.z > 0.0);
    vec3 hit = (radialAxis * cos(hitPhi1) + tangentAxis * sin(hitPhi1)) / hitU1;
    vec4 disk = diskColor(hit.xy, uTime - hitTime1, topSide, shift);
    color = color * (1.0 - disk.a * hitCoverage1) + disk.rgb * hitCoverage1;
  }

  if (hitU0 >= 0.0 && hitCoverage0 > 0.0) {
    float sourceDot = energy * sqrt(2.0 / (2.0 - 3.0 * hitU0)) -
      hitU0 * sqrt(hitU0 / (2.0 - 3.0 * hitU0)) * dot(diskNormal, planeNormal);
    float shift = receiverDot / sourceDot;
    bool topSide = (mod(abs(hitPhi0 - alpha), TAU) < 1e-3) == (radialAxis.z > 0.0);
    vec3 hit = (radialAxis * cos(hitPhi0) + tangentAxis * sin(hitPhi0)) / hitU0;
    vec4 disk = diskColor(hit.xy, uTime - hitTime0, topSide, shift);
    color = color * (1.0 - disk.a * hitCoverage0) + disk.rgb * hitCoverage0;
  }

  return max(color, vec3(0.0));
}

vec3 acesToneMap(vec3 color) {
  const float a = 2.51;
  const float b = 0.03;
  const float c = 2.43;
  const float d = 0.59;
  const float e = 0.14;
  return clamp((color * (a * color + b)) / (color * (c * color + d) + e), 0.0, 1.0);
}

vec3 linearToSrgb(vec3 color) {
  vec3 low = color * 12.92;
  vec3 high = 1.055 * pow(max(color, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055;
  return mix(high, low, lessThanEqual(color, vec3(0.0031308)));
}

void main() {
  vec2 screen = (2.0 * gl_FragCoord.xy - uResolution) / uResolution.y;
  float focalLength = 1.0 / tan(uFovY * 0.5);
  vec3 viewDirection = vec3(screen, -focalLength);
  vec3 hdr = sceneColor(viewDirection) * uExposure;
  fragmentColor = vec4(linearToSrgb(acesToneMap(hdr)), 1.0);
}
