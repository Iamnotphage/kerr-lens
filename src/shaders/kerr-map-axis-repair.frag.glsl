precision highp float;
precision highp int;

layout(location = 0) out vec4 skyTransfer;
layout(location = 1) out vec4 diskHit0;
layout(location = 2) out vec4 diskHit1;

uniform vec2 uSourceResolution;
uniform vec2 uStripResolution;
uniform sampler2D uSkyTransfer;
uniform sampler2D uDiskHit0;
uniform sampler2D uDiskHit1;

vec4 reconstructAxis(sampler2D source, vec2 uv, float axisDistance, float halfBand) {
  vec4 negativeSide = texture(source, vec2(0.5 - halfBand, uv.y));
  vec4 positiveSide = texture(source, vec2(0.5 + halfBand, uv.y));
  float blend = smoothstep(-halfBand, halfBand, axisDistance);
  return mix(negativeSide, positiveSide, blend);
}

void main() {
  float axisDistance =
    (gl_FragCoord.x - 0.5 * uStripResolution.x) / uSourceResolution.x;
  float halfBand = 0.5 * uStripResolution.x / uSourceResolution.x;
  vec2 sourceUv = vec2(
    0.5 + axisDistance,
    gl_FragCoord.y / uSourceResolution.y
  );
  skyTransfer = reconstructAxis(uSkyTransfer, sourceUv, axisDistance, halfBand);
  diskHit0 = reconstructAxis(uDiskHit0, sourceUv, axisDistance, halfBand);
  diskHit1 = reconstructAxis(uDiskHit1, sourceUv, axisDistance, halfBand);
}
