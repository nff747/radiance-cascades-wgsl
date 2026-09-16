/**
 * WGSL Radiance Cascades Interval Raymarching Compute Shader.
 * Raymarches directional radiance within bounded geometric intervals [R_min, R_max].
 */

export const cascadeRaymarchShader = /* wgsl */ `
struct CascadeUniforms {
  resolution: vec2<f32>,
  cascadeIndex: u32,
  rayCount: u32,
  intervalMin: f32,
  intervalMax: f32,
  time: f32,
  pad0: f32,
};

@group(0) @binding(0) var<uniform> config: CascadeUniforms;
@group(0) @binding(1) var outputCascade: texture_storage_2d<rgba16float, write>;

const PI: f32 = 3.141592653589793;

@compute @workgroup_size(16, 16, 1)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  let dims = vec2<u32>(config.resolution);
  if (id.x >= dims.x || id.y >= dims.y) {
    return;
  }

  // Normalized probe coordinate in world space [-1.0, 1.0]
  let probeUV = (vec2<f32>(id.xy) + 0.5) / config.resolution;
  let probePos = probeUV * 2.0 - 1.0;

  let rayIdx = id.z; // Ray angle index in [0, config.rayCount - 1]
  let angle = (f32(rayIdx) + 0.5) * (2.0 * PI / f32(config.rayCount));
  let rayDir = vec2<f32>(cos(angle), sin(angle));

  var t = config.intervalMin;
  let maxT = config.intervalMax;
  var accumulatedRadiance = vec3<f32>(0.0);
  var visibility = 1.0;

  // Sphere-trace along the ray within interval [intervalMin, intervalMax]
  for (var step = 0u; step < 64u; step = step + 1u) {
    let p = probePos + rayDir * t;
    let scene = sampleScene(p, config.time);

    if (scene.dist < 0.002) {
      // Ray hit a surface
      if (scene.isEmissive) {
        accumulatedRadiance = scene.radiance;
      }
      visibility = 0.0;
      break;
    }

    t = t + max(scene.dist, 0.002);
    if (t >= maxT) {
      break;
    }
  }

  // Alpha channel stores transmittance (1.0 = clear, passed through to next cascade)
  let result = vec4<f32>(accumulatedRadiance, visibility);
  
  // Store radiance at flat pixel coordinates (probe_x + rayIdx * width, probe_y)
  let storeCoord = vec2<u32>(id.x + rayIdx * dims.x, id.y);
  textureStore(outputCascade, storeCoord, result);
}
`;
