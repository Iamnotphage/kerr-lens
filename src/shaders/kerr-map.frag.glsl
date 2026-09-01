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

const float DISK_TRANSFER_MIN_RS = 2.25;
const float DISK_TRANSFER_MAX_RS = 14.0;
const int MAX_STEPS = 224;

float polarTurningCosineSquared(float lambda, float eta) {
  float spinSquared = uSpin * uSpin;
  float coefficient = spinSquared - eta - lambda * lambda;
  if (spinSquared > 1e-5) {
    return clamp(
      (coefficient + sqrt(max(coefficient * coefficient + 4.0 * spinSquared * eta, 0.0))) /
      (2.0 * spinSquared),
      0.0,
      1.0
    );
  }
  return clamp(eta / max(eta + lambda * lambda, 1e-6), 0.0, 1.0);
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
  float radius,
  vec3 angularDirection,
  vec2 velocity,
  float lambda,
  float eta,
  out float radiusDerivative,
  out vec3 angularDerivative,
  out float timeDerivative,
  out vec2 velocityDerivative
) {
  float cosineTheta = angularDirection.z;
  float radiusSquared = radius * radius;
  float spinSquared = uSpin * uSpin;
  float cosineSquared = cosineTheta * cosineTheta;
  float delta = max(radiusSquared - 2.0 * radius + spinSquared, 1e-5);
  float p = radiusSquared + spinSquared - uSpin * lambda;
  float shiftedMomentum = lambda - uSpin;
  float radialConstant = shiftedMomentum * shiftedMomentum + eta;
  float sineSquared = max(dot(angularDirection.xy, angularDirection.xy), 1e-10);
  float phiMino = lambda / sineSquared - uSpin + uSpin * p / delta;
  float timeMino = uSpin * (lambda - uSpin * sineSquared) +
    (radiusSquared + spinSquared) * p / delta;

  // The constants describe the future photon arriving at the observer. The
  // radial and polar velocities already point backward; phi and t therefore
  // carry the explicit parameter-reversal signs.
  float backwardPhiMino = -phiMino;
  float planarScale = -cosineTheta * velocity.y / sineSquared;
  radiusDerivative = velocity.x;
  angularDerivative = vec3(
    planarScale * angularDirection.x - backwardPhiMino * angularDirection.y,
    planarScale * angularDirection.y + backwardPhiMino * angularDirection.x,
    velocity.y
  );
  timeDerivative = -timeMino;
  // Differentiating (dr/dgamma)^2 = R and (dmu/dgamma)^2 = M
  // gives continuous equations through both Carter turning points.
  velocityDerivative = vec2(
    2.0 * radius * p - (radius - 1.0) * radialConstant,
    (spinSquared - eta - lambda * lambda) * cosineTheta -
      2.0 * spinSquared * cosineTheta * cosineSquared
  );
}

vec4 encodedDiskHit(float radiusM, vec2 direction, float coordinateTime) {
  float radiusRs = radiusM * 0.5;
  return vec4(
    radiusRs * direction,
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

  vec3 angularDirection = vec3(sineTheta, 0.0, cosineTheta);
  float coordinateTime = 0.0;
  vec2 velocity = vec2(
    -sqrt(max(radialPotential(radius, lambda, eta), 0.0)),
    (backwardDirection.y >= 0.0 ? 1.0 : -1.0) *
      sqrt(max(polarPotential(cosineTheta, lambda, eta), 0.0))
  );
  float outerHorizon = 1.0 + sqrt(max(1.0 - spinSquared, 0.0));
  float escapeRadius = max(initialRadius + 20.0, 72.0);
  float turningCosineSquared = polarTurningCosineSquared(lambda, eta);
  float polarTurningCosine = sqrt(turningCosineSquared);
  int hitCount = 0;

  for (int stepIndex = 0; stepIndex < MAX_STEPS; stepIndex += 1) {
    if (radius <= outerHorizon + 0.025) {
      break;
    }
    if (velocity.x > 0.0 && radius >= escapeRadius) {
      break;
    }

    float targetCoordinateStep = mix(
      0.075,
      1.65,
      smoothstep(outerHorizon + 0.3, 28.0, radius)
    );
    float radiusDerivative;
    vec3 angularDerivative;
    float timeDerivative;
    vec2 velocityDerivative;
    minoDerivative(
      radius,
      angularDirection,
      velocity,
      lambda,
      eta,
      radiusDerivative,
      angularDerivative,
      timeDerivative,
      velocityDerivative
    );
    float minoStep = targetCoordinateStep / max(abs(velocity.x), 0.5);
    minoStep = min(minoStep, 0.025 / max(abs(velocity.y), 0.25));
    minoStep = min(minoStep, 0.08 / max(length(angularDerivative), 0.5));
    minoStep = clamp(minoStep, 1e-5, 0.05);

    float midpointRadius = radius + radiusDerivative * (0.5 * minoStep);
    vec3 midpointAngularDirection = normalize(
      angularDirection + angularDerivative * (0.5 * minoStep)
    );
    vec2 midpointVelocity = velocity + velocityDerivative * (0.5 * minoStep);
    float midpointRadiusDerivative;
    vec3 midpointAngularDerivative;
    float midpointTimeDerivative;
    vec2 midpointVelocityDerivative;
    minoDerivative(
      midpointRadius,
      midpointAngularDirection,
      midpointVelocity,
      lambda,
      eta,
      midpointRadiusDerivative,
      midpointAngularDerivative,
      midpointTimeDerivative,
      midpointVelocityDerivative
    );
    float nextRadius = radius + midpointRadiusDerivative * minoStep;
    vec3 nextAngularDirection = normalize(
      angularDirection + midpointAngularDerivative * minoStep
    );
    float nextCoordinateTime = coordinateTime + midpointTimeDerivative * minoStep;
    vec2 nextVelocity = velocity + midpointVelocityDerivative * minoStep;

    // Midpoint truncation can overshoot a Carter root by a small amount. Fold
    // mu back into its exact interval while preserving the regular Cartesian
    // angular phase; unlike BL phi, this representation is finite at the axis.
    if (abs(nextAngularDirection.z) > polarTurningCosine) {
      float pole = nextAngularDirection.z >= 0.0 ? 1.0 : -1.0;
      float reflectedCosine = pole * (
        2.0 * polarTurningCosine - abs(nextAngularDirection.z)
      );
      reflectedCosine = clamp(reflectedCosine, -1.0, 1.0);
      float reflectedSine = sqrt(max(1.0 - reflectedCosine * reflectedCosine, 0.0));
      vec2 planarDirection = nextAngularDirection.xy;
      float planarLength = length(planarDirection);
      if (planarLength > 1e-8) {
        planarDirection *= reflectedSine / planarLength;
      } else {
        planarDirection = reflectedSine * normalize(angularDirection.xy + vec2(1e-8, 0.0));
      }
      nextAngularDirection = vec3(planarDirection, reflectedCosine);
      nextVelocity.y = -pole * abs(nextVelocity.y);
    }

    if (
      angularDirection.z * nextAngularDirection.z <= 0.0 &&
      angularDirection.z != nextAngularDirection.z
    ) {
      float crossing = clamp(
        angularDirection.z / (angularDirection.z - nextAngularDirection.z),
        0.0,
        1.0
      );
      float hitRadiusM = mix(radius, nextRadius, crossing);
      float hitRadiusRs = hitRadiusM * 0.5;
      if (
        hitRadiusRs >= DISK_TRANSFER_MIN_RS &&
        hitRadiusRs <= DISK_TRANSFER_MAX_RS
      ) {
        vec2 hitDirection = normalize(mix(
          angularDirection.xy,
          nextAngularDirection.xy,
          crossing
        ));
        vec4 hit = encodedDiskHit(
          hitRadiusM,
          hitDirection,
          mix(coordinateTime, nextCoordinateTime, crossing)
        );
        if (hitCount == 0) diskHit0 = hit;
        else if (hitCount == 1) diskHit1 = hit;
        hitCount += 1;
      }
    }

    nextCoordinateTime = max(nextCoordinateTime, -130000.0);
    radius = nextRadius;
    angularDirection = nextAngularDirection;
    coordinateTime = nextCoordinateTime;
    velocity = nextVelocity;
  }

  // The independently projected critical curve is authoritative for capture
  // at display resolution. Always provide a finite direction so a ray that
  // has not reached the distant escape sphere within the fixed step budget
  // cannot create a false black halo outside that exact boundary.
  skyTransfer = vec4(normalize(angularDirection), 1.0);
}
