precision highp float;
precision highp int;

layout(location = 0) out vec4 skyTransfer;
layout(location = 1) out vec4 diskHit0;
layout(location = 2) out vec4 diskHit1;

uniform vec2 uResolution;
uniform float uFovY;
uniform float uSpin;
uniform float uObserverRadiusRs;
uniform float uObserverInclination;

const float INNER_DISK_RADIUS_RS = 3.0;
const float OUTER_DISK_RADIUS_RS = 12.0;
const float POLAR_CHART_CAP = 0.995;
const int MAX_STEPS = 224;

float polarChartAzimuthJump(float lambda, float eta) {
  float spinSquared = uSpin * uSpin;
  float coefficient = spinSquared - eta - lambda * lambda;
  float turningCosineSquared;
  if (spinSquared > 1e-5) {
    turningCosineSquared =
      (coefficient + sqrt(max(coefficient * coefficient + 4.0 * spinSquared * eta, 0.0))) /
      (2.0 * spinSquared);
  } else {
    turningCosineSquared = eta / max(eta + lambda * lambda, 1e-6);
  }
  float turningSine = sqrt(max(1.0 - clamp(turningCosineSquared, 0.0, 1.0), 0.0));
  float capSine = sqrt(1.0 - POLAR_CHART_CAP * POLAR_CHART_CAP);
  float halfJump = acos(clamp(turningSine / capSine, 0.0, 1.0));
  return (lambda >= 0.0 ? -2.0 : 2.0) * halfJump;
}

float radialPotential(float radius, float lambda, float eta) {
  float delta = radius * radius - 2.0 * radius + uSpin * uSpin;
  float p = radius * radius + uSpin * uSpin - uSpin * lambda;
  float shiftedMomentum = lambda - uSpin;
  return p * p - delta * (shiftedMomentum * shiftedMomentum + eta);
}

float polarPotential(float cosineTheta, float lambda, float eta) {
  float cosineSquared = cosineTheta * cosineTheta;
  return eta +
    (uSpin * uSpin - eta - lambda * lambda) * cosineSquared -
    uSpin * uSpin * cosineSquared * cosineSquared;
}

vec4 rayDerivative(
  float radius,
  float cosineTheta,
  float radialSign,
  float polarSign,
  float lambda,
  float eta
) {
  float radiusSquared = radius * radius;
  float spinSquared = uSpin * uSpin;
  float cosineSquared = cosineTheta * cosineTheta;
  float sigma = radiusSquared + spinSquared * cosineSquared;
  float delta = max(radiusSquared - 2.0 * radius + spinSquared, 1e-5);
  float p = radiusSquared + spinSquared - uSpin * lambda;
  float radial = sqrt(max(radialPotential(radius, lambda, eta), 0.0));
  float polar = sqrt(max(polarPotential(cosineTheta, lambda, eta), 0.0));
  float sineSquared = max(1.0 - cosineSquared, 1e-5);
  float phiMino = lambda / sineSquared - uSpin + uSpin * p / delta;
  float timeMino = uSpin * (lambda - uSpin * sineSquared) +
    (radiusSquared + spinSquared) * p / delta;

  // The constants describe the future photon arriving at the observer. We
  // integrate the same curve backward, hence the minus signs on phi and time.
  return vec4(
    radialSign * radial / sigma,
    polarSign * polar / sigma,
    -phiMino / sigma,
    -timeMino / sigma
  );
}

vec4 encodedDiskHit(float radiusM, float phi, float coordinateTime) {
  float radiusRs = radiusM * 0.5;
  return vec4(
    radiusRs * cos(phi),
    radiusRs * sin(phi),
    min(max(-coordinateTime * 0.5, 0.0), 65000.0),
    1.0
  );
}

void main() {
  skyTransfer = vec4(0.0);
  diskHit0 = vec4(0.0);
  diskHit1 = vec4(0.0);

  vec2 screen = (2.0 * gl_FragCoord.xy - uResolution) / uResolution.y;
  float focalLength = 1.0 / tan(uFovY * 0.5);
  vec3 backwardDirection = normalize(vec3(screen, -focalLength));

  float radius = 2.0 * uObserverRadiusRs;
  float initialRadius = radius;
  float cosineTheta = cos(uObserverInclination);
  float sineTheta = sin(uObserverInclination);
  float spinSquared = uSpin * uSpin;
  float sigma = radius * radius + spinSquared * cosineTheta * cosineTheta;
  float delta = radius * radius - 2.0 * radius + spinSquared;
  float area = (radius * radius + spinSquared) * (radius * radius + spinSquared) -
    spinSquared * delta * sineTheta * sineTheta;
  float lapse = sqrt(sigma * delta / area);
  float frameDragging = 2.0 * uSpin * radius / area;
  float sqrtGphiPhi = sineTheta * sqrt(area / sigma);

  // Future photon = minus the past-directed camera ray. Camera up is -theta.
  float futurePhi = -backwardDirection.x;
  float futureTheta = backwardDirection.y;
  float angularMomentum = futurePhi * sqrtGphiPhi;
  float energy = lapse + frameDragging * angularMomentum;
  float lambda = angularMomentum / energy;
  float covariantThetaMomentum = futureTheta * sqrt(sigma);
  float eta = (covariantThetaMomentum / energy) * (covariantThetaMomentum / energy) +
    cosineTheta * cosineTheta *
      (lambda * lambda / max(sineTheta * sineTheta, 1e-6) - spinSquared);

  float radialSign = -1.0;
  float polarSign = backwardDirection.y >= 0.0 ? 1.0 : -1.0;
  float phi = 0.0;
  float coordinateTime = 0.0;
  float outerHorizon = 1.0 + sqrt(max(1.0 - spinSquared, 0.0));
  float escapeRadius = max(initialRadius + 20.0, 72.0);
  bool escaped = false;
  bool captured = false;
  int hitCount = 0;

  for (int stepIndex = 0; stepIndex < MAX_STEPS; stepIndex += 1) {
    if (radius <= outerHorizon + 0.025) {
      captured = true;
      break;
    }
    if (radialSign > 0.0 && radius >= escapeRadius) {
      escaped = true;
      break;
    }

    float stepSize = mix(
      0.075,
      1.65,
      smoothstep(outerHorizon + 0.3, 28.0, radius)
    );
    vec4 derivative = rayDerivative(
      radius,
      cosineTheta,
      radialSign,
      polarSign,
      lambda,
      eta
    );
    vec4 midpoint = vec4(radius, cosineTheta, phi, coordinateTime) +
      derivative * (0.5 * stepSize);

    if (radialPotential(midpoint.x, lambda, eta) < -2e-4) {
      radialSign = -radialSign;
      continue;
    }
    // Boyer–Lindquist azimuth is singular on the spin axis. A ray entering
    // this polar chart cap exits on the opposite meridian: phi changes by pi
    // while the physical Cartesian direction stays continuous. Resolving the
    // lambda/sin²(theta) spike with uniform affine steps causes a false
    // vertical seam, so perform the equivalent chart transition explicitly.
    if (abs(midpoint.y) >= POLAR_CHART_CAP) {
      polarSign = -polarSign;
      phi += polarChartAzimuthJump(lambda, eta);
      continue;
    }
    if (
      abs(midpoint.y) >= 0.999999 ||
      polarPotential(midpoint.y, lambda, eta) < -2e-5
    ) {
      polarSign = -polarSign;
      continue;
    }

    vec4 midpointDerivative = rayDerivative(
      midpoint.x,
      midpoint.y,
      radialSign,
      polarSign,
      lambda,
      eta
    );
    vec4 next = vec4(radius, cosineTheta, phi, coordinateTime) +
      midpointDerivative * stepSize;

    if (radialPotential(next.x, lambda, eta) < -5e-4) {
      radialSign = -radialSign;
      continue;
    }
    if (abs(next.y) >= POLAR_CHART_CAP) {
      polarSign = -polarSign;
      phi += polarChartAzimuthJump(lambda, eta);
      continue;
    }
    if (abs(next.y) >= 1.0 || polarPotential(next.y, lambda, eta) < -5e-5) {
      polarSign = -polarSign;
      continue;
    }

    if (cosineTheta * next.y <= 0.0 && cosineTheta != next.y) {
      float crossing = clamp(cosineTheta / (cosineTheta - next.y), 0.0, 1.0);
      float hitRadiusM = mix(radius, next.x, crossing);
      float hitRadiusRs = hitRadiusM * 0.5;
      if (
        hitRadiusRs >= INNER_DISK_RADIUS_RS * 0.985 &&
        hitRadiusRs <= OUTER_DISK_RADIUS_RS * 1.015
      ) {
        vec4 hit = encodedDiskHit(
          hitRadiusM,
          mix(phi, next.z, crossing),
          mix(coordinateTime, next.w, crossing)
        );
        if (hitCount == 0) diskHit0 = hit;
        else if (hitCount == 1) diskHit1 = hit;
        hitCount += 1;
      }
    }

    radius = next.x;
    cosineTheta = clamp(next.y, -0.999999, 0.999999);
    phi = next.z;
    coordinateTime = max(next.w, -130000.0);
  }

  if (!escaped && !captured && radialSign > 0.0 && radius > 8.0) {
    escaped = true;
  }
  if (escaped) {
    float sine = sqrt(max(1.0 - cosineTheta * cosineTheta, 0.0));
    skyTransfer = vec4(
      sine * cos(phi),
      sine * sin(phi),
      cosineTheta,
      1.0
    );
  }
}
