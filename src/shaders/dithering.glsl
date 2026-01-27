// 8x8 Bayer ordered dithering matrix
// Used for half-tone/lidar aesthetic effect

const int bayerMatrix[64] = int[64](
   0, 32,  8, 40,  2, 34, 10, 42,
  48, 16, 56, 24, 50, 18, 58, 26,
  12, 44,  4, 36, 14, 46,  6, 38,
  60, 28, 52, 20, 62, 30, 54, 22,
   3, 35, 11, 43,  1, 33,  9, 41,
  51, 19, 59, 27, 49, 17, 57, 25,
  15, 47,  7, 39, 13, 45,  5, 37,
  63, 31, 55, 23, 61, 29, 53, 21
);

float getBayerValue(vec2 coord) {
  int x = int(mod(coord.x, 8.0));
  int y = int(mod(coord.y, 8.0));
  return float(bayerMatrix[y * 8 + x]) / 64.0;
}

vec3 applyDithering(vec3 color, vec2 fragCoord, float ditherStrength) {
  float bayerValue = getBayerValue(fragCoord);
  float luminance = dot(color, vec3(0.299, 0.587, 0.114));

  // Threshold based on Bayer matrix
  float threshold = bayerValue * ditherStrength;

  // Convert to monochrome based on dithering
  if (luminance > threshold) {
    return vec3(1.0);
  } else {
    return vec3(0.0);
  }
}
