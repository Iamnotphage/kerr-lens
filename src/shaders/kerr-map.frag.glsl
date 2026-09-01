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

void minoDerivative(
  vec4 position,
  vec2 velocity,
  float lambda,
  float eta,
  out vec4 coordinateDerivative,
  out vec2 velocityDerivative
) {
  float radius = position.x;
  float cosineTheta = position.y;
  float radiusSquared = radius * radius;
  float spinSquared = uSpin * uSpin;
  float cosineSquared = cosineTheta * cosineTheta;
  float delta = max(radiusSquared - 2.0 * radius + spinSquared, 1e-5);
  float p = radiusSquared + spinSquared - uSpin * lambda;
  float shiftedMomentum = lambda - uSpin;
  float radialConstant = shiftedMomentum * shiftedMomentum + eta;
  float sineSquared = max(1.0 - cosineSquared, 1e-5);
  float phiMino = lambda / sineSquared - uSpin + uSpin * p / delta;
  float timeMino = uSpin * (lambda - uSpin * sineSquared) +
    (radiusSquared + spinSquared) * p / delta;

  // The constants describe the future photon arriving at the observer. The
  // radial and polar velocities already point backward; phi and t therefore
  // carry the explicit parameter-reversal signs.
  coordinateDerivative = vec4(
    velocity.x,
    velocity.y,
    -phiMino,
    -timeMino
  );
  // Differentiating (dr/dgamma)^2 = R and (dmu/dgamma)^2 = M
  // gives continuous equations through both Carter turning points.
  velocityDerivative = vec2(
    2.0 * radius * p - (radius - 1.0) * radialConstant,
    (spinSquared - eta - lambda * lambda) * cosineTheta -
      2.0 * spinSquared * cosineTheta * cosineSquared
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

  vec4 position = vec4(radius, cosineTheta, 0.0, 0.0);
  vec2 velocity = vec2(
    -sqrt(max(radialPotential(radius, lambda, eta), 0.0)),
    (backwardDirection.y >= 0.0 ? 1.0 : -1.0) *
      sqrt(max(polarPotential(cosineTheta, lambda, eta), 0.0))
  );
  float outerHorizon = 1.0 + sqrt(max(1.0 - spinSquared, 0.0));
  float escapeRadius = max(initialRadius + 20.0, 72.0);
  bool escaped = false;
  bool captured = false;
  int hitCount = 0;

  for (int stepIndex = 0; stepIndex < MAX_STEPS; stepIndex += 1) {
    if (position.x <= outerHorizon + 0.025) {
      captured = true;
      break;
    }
    if (velocity.x > 0.0 && position.x >= escapeRadius) {
      escaped = true;
      break;
    }

    float targetCoordinateStep = mix(
      0.075,
      1.65,
      smoothstep(outerHorizon + 0.3, 28.0, position.x)
    );
    vec4 coordinateDerivative;
    vec2 velocityDerivative;
    minoDerivative(
      position,
      velocity,
      lambda,
      eta,
      coordinateDerivative,
      velocityDerivative
    );
    float minoStep = targetCoordinateStep / max(abs(velocity.x), 0.5);
    minoStep = min(minoStep, 0.025 / max(abs(velocity.y), 0.25));
    minoStep = min(minoStep, 0.14 / max(abs(coordinateDerivative.z), 0.5));
    minoStep = clamp(minoStep, 1e-5, 0.05);

    vec4 midpointPosition = position + coordinateDerivative * (0.5 * minoStep);
    vec2 midpointVelocity = velocity + velocityDerivative * (0.5 * minoStep);
    vec4 midpointCoordinateDerivative;
    vec2 midpointVelocityDerivative;
    minoDerivative(
      midpointPosition,
      midpointVelocity,
      lambda,
      eta,
      midpointCoordinateDerivative,
      midpointVelocityDerivative
    );
    vec4 next = position + midpointCoordinateDerivative * minoStep;
    vec2 nextVelocity = velocity + midpointVelocityDerivative * minoStep;

    // Boyer–Lindquist azimuth is singular on the spin axis. Reflect the polar
    // chart coordinate at a small cap and add the integrated azimuth skipped
    // inside it; the physical Cartesian direction remains continuous.
    if (abs(next.y) >= POLAR_CHART_CAP) {
      float pole = next.y >= 0.0 ? 1.0 : -1.0;
      next.y = pole * (2.0 * POLAR_CHART_CAP - abs(next.y));
      nextVelocity.y = -nextVelocity.y;
      next.z += polarChartAzimuthJump(lambda, eta);
    }

    if (position.y * next.y <= 0.0 && position.y != next.y) {
      float crossing = clamp(position.y / (position.y - next.y), 0.0, 1.0);
      float hitRadiusM = mix(position.x, next.x, crossing);
      float hitRadiusRs = hitRadiusM * 0.5;
      if (
        hitRadiusRs >= INNER_DISK_RADIUS_RS * 0.985 &&
        hitRadiusRs <= OUTER_DISK_RADIUS_RS * 1.015
      ) {
        vec4 hit = encodedDiskHit(
          hitRadiusM,
          mix(position.z, next.z, crossing),
          mix(position.w, next.w, crossing)
        );
        if (hitCount == 0) diskHit0 = hit;
        else if (hitCount == 1) diskHit1 = hit;
        hitCount += 1;
      }
    }

    next.w = max(next.w, -130000.0);
    position = next;
    velocity = nextVelocity;
  }

  if (!escaped && !captured && velocity.x > 0.0 && position.x > 8.0) {
    escaped = true;
  }
  if (escaped) {
    float sine = sqrt(max(1.0 - position.y * position.y, 0.0));
    skyTransfer = vec4(
      sine * cos(position.z),
      sine * sin(position.z),
      position.y,
      1.0
    );
  }
}
