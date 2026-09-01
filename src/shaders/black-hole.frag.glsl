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
uniform sampler2D uDiskTemperatureTexture;
uniform sampler2D uNoiseTexture;
uniform sampler2D uSkyTexture;
uniform sampler2D uKerrSkyTexture;
uniform sampler2D uKerrDiskHit0Texture;
uniform sampler2D uKerrDiskHit1Texture;
uniform sampler2D uKerrShadowTexture;

uniform float uTime;
uniform float uExposure;
uniform float uDiskPeakTemperature;
uniform float uSpectralDilution;
uniform int uDiskAppearance;
uniform int uDiskEnabled;
uniform int uDopplerEnabled;
uniform int uSkyEnabled;
uniform int uKerrMapReady;
uniform float uKerrSpin;
uniform vec2 uKerrShadowCenter;

const float PI = 3.14159265358979323846;
const float TAU = 6.28318530717958647692;
const float MU = 4.0 / 27.0;
const float INNER_DISK_RADIUS = 3.0;
const float OUTER_DISK_RADIUS = 12.0;
const int DEFLECTION_WIDTH = 512;
const int DEFLECTION_HEIGHT = 512;
const int INVERSE_RADIUS_WIDTH = 64;
const int INVERSE_RADIUS_HEIGHT = 32;
const int DISK_TEMPERATURE_WIDTH = 256;
const float BLACK_BODY_TABLE_MAX_TEMPERATURE = 39408.3376;
// A frozen 2D texture sheared forever by Omega(r) eventually phase-mixes into
// sub-pixel radial bands. Real disk turbulence has a finite correlation time,
// so overlapping fields are born and retired before that can happen.
const float FLOW_COHERENCE_TIME = 12.0;
const float FLOW_SEED_PERIOD = 97.0;
// Mild, nearly luminance-neutral film grade: Rec.709 weighted gain ≈ 1.003.
const vec3 CINEMATIC_WARM_GRADE = vec3(1.08, 0.99, 0.91);

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
  float clampedTemperature = clamp(temperature, 100.0, BLACK_BODY_TABLE_MAX_TEMPERATURE);
  float textureU = clamp(log(clampedTemperature / 100.0) / 6.0, 0.0, 1.0);
  float hotRatio = max(temperature / BLACK_BODY_TABLE_MAX_TEMPERATURE, 1.0);
  // Continue the last measured lookup slope smoothly, tending to the linear
  // Rayleigh–Jeans temperature dependence above the table's visible range.
  float highTemperatureScale = 1.35 * hotRatio - 0.35;
  // Absolute detector exposure is unspecified; this scale places the physical
  // radiance ratios in a useful HDR range before the user exposure control.
  return texture(uBlackBodyTexture, vec2(textureU, 0.5)).rgb * highTemperatureScale * 1.35e-8;
}

float diskTemperatureProfile(float radius) {
  float profileU = (radius - INNER_DISK_RADIUS) /
    (OUTER_DISK_RADIUS - INNER_DISK_RADIUS);
  profileU = unitTextureCoordinate(clamp(profileU, 0.0, 1.0), DISK_TEMPERATURE_WIDTH);
  return texture(uDiskTemperatureTexture, vec2(profileU, 0.5)).r;
}

vec2 flowEpochOffset(float epoch) {
  float wrappedEpoch = mod(epoch, FLOW_SEED_PERIOD);
  return fract(vec2(wrappedEpoch * 0.754877666, wrappedEpoch * 0.569840296));
}

float advectedDiskStructure(
  vec2 direction,
  float radius,
  float omega,
  float spiralTwist,
  float fieldAge,
  vec2 epochOffset
) {
  // Rotate the normalized disk-plane position directly instead of recovering
  // its angle with atan(). This is exactly continuous across the negative-x
  // axis, where atan(y, x) changes branch from +PI to -PI.
  float twist = -fieldAge * omega + spiralTwist;
  float cosTwist = cos(twist);
  float sinTwist = sin(twist);
  vec2 flowDirection = vec2(
    cosTwist * direction.x - sinTwist * direction.y,
    sinTwist * direction.x + cosTwist * direction.y
  );
  vec2 flowPosition = radius * flowDirection;
  vec2 broadUv = flowPosition * 0.105;
  // R stores the broad field and G stores a prepacked 3.65x-frequency field,
  // keeping each finite-age generation to one texture lookup.
  vec2 turbulence = texture(
    uNoiseTexture,
    broadUv + vec2(0.37, 0.71) + epochOffset
  ).rg;
  float broad = turbulence.r;
  float fine = turbulence.g;

  // sin(3a) = 3 sin(a) - 4 sin^3(a) gives a three-arm filament field
  // without a non-periodic raw-angle multiplier or another trig evaluation.
  float flowY = flowDirection.y;
  float filament = 0.5 + 0.5 * flowY * (3.0 - 4.0 * flowY * flowY);
  return smoothstep(0.2, 0.82, 0.52 * broad + 0.34 * fine + 0.14 * filament);
}

float diskBrightnessStructure(vec2 position, float radius, float coordinateTime) {
  float inverseRadius = 1.0 / radius;
  vec2 direction = position * inverseRadius;
  float omega = sqrt(0.5 * inverseRadius * inverseRadius * inverseRadius);
  float spiralTwist = 1.35 * log(radius / INNER_DISK_RADIUS);
  float cycle = coordinateTime / FLOW_COHERENCE_TIME + 0.5;
  float epoch = floor(cycle);
  float phase = fract(cycle);
  float blend = phase * phase * (3.0 - 2.0 * phase);

  // A field lives for two adjacent epochs. At a boundary the old current field
  // becomes the new previous field at the exact same age, and the zero-slope
  // smoothstep weights make both value and first temporal derivative continuous.
  float previous = advectedDiskStructure(
    direction,
    radius,
    omega,
    spiralTwist,
    (phase + 1.0) * FLOW_COHERENCE_TIME,
    flowEpochOffset(epoch - 1.0)
  );
  float current = advectedDiskStructure(
    direction,
    radius,
    omega,
    spiralTwist,
    phase * FLOW_COHERENCE_TIME,
    flowEpochOffset(epoch)
  );
  return mix(previous, current, blend);
}

vec4 diskColor(vec2 position, float coordinateTime, float shiftFactor) {
  if (uDiskEnabled == 0) return vec4(0.0);
  float radius = length(position);
  if (radius <= INNER_DISK_RADIUS || radius >= OUTER_DISK_RADIUS) return vec4(0.0);

  float structure = diskBrightnessStructure(position, radius, coordinateTime);
  float edge = smoothstep(INNER_DISK_RADIUS, INNER_DISK_RADIUS * 1.03, radius) *
    (1.0 - smoothstep(OUTER_DISK_RADIUS * 0.91, OUTER_DISK_RADIUS, radius));
  float shift = uDopplerEnabled == 1 ? clamp(shiftFactor, 0.18, 4.0) : 1.0;

  if (uDiskAppearance == 1) {
    // DNGR-inspired presentation preset. Interstellar's art-directed disk was
    // held at 4500 K and described as marginally optically thick. A rational
    // optical-depth map preserves translucent wisps without an exp() or extra
    // texture fetch, and the RGB value remains premultiplied for compositing.
    float radialPosition = (radius - INNER_DISK_RADIUS) /
      (OUTER_DISK_RADIUS - INNER_DISK_RADIUS);
    float density = pow(structure, 1.35);
    float opticalDepth = mix(0.12, 1.9, density) * mix(1.08, 0.62, radialPosition) * edge;
    float opacity = opticalDepth / (1.0 + opticalDepth);
    float brightness = mix(0.22, 1.55, density) * mix(1.08, 0.72, radialPosition);
    vec3 radiance = blackBodyRadiance(4500.0 * shift) *
      CINEMATIC_WARM_GRADE * 35.0 * brightness;
    return vec4(radiance * opacity, opacity);
  }

  float temperature = uDiskPeakTemperature * diskTemperatureProfile(radius) * shift;
  float brightness = mix(0.74, 1.18, structure);
  vec3 radiance = blackBodyRadiance(temperature) * uSpectralDilution * brightness * 0.58;
  // The thermal thin disk is an optically thick photosphere: texture controls
  // surface brightness only, while alpha remains one away from its finite edge.
  return vec4(radiance * edge, edge);
}

vec3 schwarzschildSceneColor(vec3 viewDirection) {
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
    vec3 hit = (radialAxis * cos(hitPhi1) + tangentAxis * sin(hitPhi1)) / hitU1;
    vec4 disk = diskColor(hit.xy, uTime - hitTime1, shift);
    color = color * (1.0 - disk.a * hitCoverage1) + disk.rgb * hitCoverage1;
  }

  if (hitU0 >= 0.0 && hitCoverage0 > 0.0) {
    float sourceDot = energy * sqrt(2.0 / (2.0 - 3.0 * hitU0)) -
      hitU0 * sqrt(hitU0 / (2.0 - 3.0 * hitU0)) * dot(diskNormal, planeNormal);
    float shift = receiverDot / sourceDot;
    vec3 hit = (radialAxis * cos(hitPhi0) + tangentAxis * sin(hitPhi0)) / hitU0;
    vec4 disk = diskColor(hit.xy, uTime - hitTime0, shift);
    color = color * (1.0 - disk.a * hitCoverage0) + disk.rgb * hitCoverage0;
  }

  return max(color, vec3(0.0));
}

vec3 rotateAroundSpinAxis(vec3 direction, float azimuth) {
  float cosine = cos(azimuth);
  float sine = sin(azimuth);
  return vec3(
    cosine * direction.x - sine * direction.y,
    sine * direction.x + cosine * direction.y,
    direction.z
  );
}

vec2 rotateDiskPosition(vec2 position, float azimuth) {
  float cosine = cos(azimuth);
  float sine = sin(azimuth);
  return vec2(
    cosine * position.x - sine * position.y,
    sine * position.x + cosine * position.y
  );
}

float kerrScreenLambda(vec2 screen) {
  float focalLength = 1.0 / tan(uFovY * 0.5);
  vec3 backwardDirection = normalize(vec3(screen, -focalLength));
  float radius = 2.0 * uCameraCoordinates.y;
  float cosineTheta = cos(uCameraCoordinates.z);
  float sineTheta = sin(uCameraCoordinates.z);
  float spinSquared = uKerrSpin * uKerrSpin;
  float sigma = radius * radius + spinSquared * cosineTheta * cosineTheta;
  float delta = radius * radius - 2.0 * radius + spinSquared;
  float area = (radius * radius + spinSquared) * (radius * radius + spinSquared) -
    spinSquared * delta * sineTheta * sineTheta;
  float lapse = sqrt(sigma * delta / area);
  float frameDragging = 2.0 * uKerrSpin * radius / area;
  float angularMomentum = -backwardDirection.x * sineTheta * sqrt(area / sigma);
  return angularMomentum / (lapse + frameDragging * angularMomentum);
}

/**
 * V2.1 keeps the V2.0 Schwarzschild circular emitter while replacing the ray
 * constants and path with Kerr. V2.2 upgrades this mixed transfer factor to
 * the complete Kerr circular four-velocity and spin-dependent disk edge.
 */
float v21FrequencyShift(float radiusRs, float lambda) {
  float observerRadiusM = 2.0 * uCameraCoordinates.y;
  float cosineTheta = cos(uCameraCoordinates.z);
  float sineTheta = sin(uCameraCoordinates.z);
  float spinSquared = uKerrSpin * uKerrSpin;
  float sigma = observerRadiusM * observerRadiusM +
    spinSquared * cosineTheta * cosineTheta;
  float delta = observerRadiusM * observerRadiusM - 2.0 * observerRadiusM + spinSquared;
  float area =
    (observerRadiusM * observerRadiusM + spinSquared) *
      (observerRadiusM * observerRadiusM + spinSquared) -
    spinSquared * delta * sineTheta * sineTheta;
  float lapse = sqrt(sigma * delta / area);
  float frameDragging = 2.0 * uKerrSpin * observerRadiusM / area;
  float observerEnergy = (1.0 - frameDragging * lambda) / lapse;

  float emitterRadiusM = 2.0 * radiusRs;
  float emitterTimeComponent = inversesqrt(max(1.0 - 3.0 / emitterRadiusM, 1e-4));
  float emitterOmega = inversesqrt(emitterRadiusM * emitterRadiusM * emitterRadiusM);
  float emitterEnergy = emitterTimeComponent * max(1.0 - emitterOmega * lambda, 0.04);
  return observerEnergy / emitterEnergy;
}

vec3 kerrSceneColor(vec2 screen) {
  vec2 transferUv = gl_FragCoord.xy / uResolution;
  vec4 skyTransfer = texture(uKerrSkyTexture, transferUv);
  vec2 shadowOffset = screen - uKerrShadowCenter;
  float shadowAngle = atan(shadowOffset.y, shadowOffset.x) / TAU + 0.5;
  float shadowRadius = texture(uKerrShadowTexture, vec2(shadowAngle, 0.5)).r;
  float shadowDistance = length(shadowOffset) - shadowRadius;
  float shadowFilter = max(fwidth(shadowDistance), 1e-5);
  float outsideShadow = smoothstep(-shadowFilter, shadowFilter, shadowDistance);
  float escaped = smoothstep(0.2, 0.8, skyTransfer.a) * outsideShadow;
  vec3 sourceDirection = rotateAroundSpinAxis(
    normalize(skyTransfer.xyz + vec3(0.0, 0.0, 1e-8)),
    uCameraCoordinates.w
  );
  vec3 color = skyColor(sourceDirection) * escaped;

  float lambda = kerrScreenLambda(screen);
  vec4 hit1 = texture(uKerrDiskHit1Texture, transferUv);
  float hitCoverage1 = smoothstep(0.2, 0.8, hit1.a);
  if (hitCoverage1 > 0.0) {
    vec2 hitPosition = rotateDiskPosition(hit1.xy, uCameraCoordinates.w);
    float shift = v21FrequencyShift(length(hitPosition), lambda);
    vec4 disk = diskColor(hitPosition, uTime - hit1.z, shift);
    color = color * (1.0 - disk.a * hitCoverage1) + disk.rgb * hitCoverage1;
  }

  vec4 hit0 = texture(uKerrDiskHit0Texture, transferUv);
  float hitCoverage0 = smoothstep(0.2, 0.8, hit0.a);
  if (hitCoverage0 > 0.0) {
    vec2 hitPosition = rotateDiskPosition(hit0.xy, uCameraCoordinates.w);
    float shift = v21FrequencyShift(length(hitPosition), lambda);
    vec4 disk = diskColor(hitPosition, uTime - hit0.z, shift);
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
  vec3 hdr = (uKerrMapReady == 1
    ? kerrSceneColor(screen)
    : schwarzschildSceneColor(viewDirection)) * uExposure;
  fragmentColor = vec4(linearToSrgb(acesToneMap(hdr)), 1.0);
}
