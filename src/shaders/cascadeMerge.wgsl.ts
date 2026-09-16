/**
 * WGSL Hierarchical Cascade Merging Compute Shader.
 * Merges outer cascade radiance (c + 1) into inner cascade (c)
 * using bilinear spatial sampling and angular cone interpolation.
 */

export const cascadeMergeShader = /* wgsl */ `
struct MergeUniforms {
  resolution: vec2<f32>,
  currentRayCount: u32,
  upperRayCount: u32,
};

@group(0) @binding(0) var<uniform> config: MergeUniforms;
@group(0) @binding(1) var currentCascade: texture_storage_2d<rgba16float, read_write>;
@group(0) @binding(2) var upperCascade: texture_storage_2d<rgba16float, read>;

@compute @workgroup_size(16, 16, 1)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  let dims = vec2<u32>(config.resolution);
  if (id.x >= dims.x || id.y >= dims.y) {
    return;
  }

  let rayIdx = id.z; // Ray index in current cascade
  let storeCoord = vec2<u32>(id.x + rayIdx * dims.x, id.y);
  let localSample = textureLoad(currentCascade, storeCoord);

  // If local ray hit an occluder, it has zero transmittance (visibility == 0)
  // so no light from outer cascades can pass through.
  if (localSample.w <= 0.001) {
    return;
  }

  // Each ray in cascade c maps to (upperRayCount / currentRayCount) = 4 rays in cascade c + 1
  let branchingFactor = config.upperRayCount / config.currentRayCount;
  let baseUpperRayIdx = rayIdx * branchingFactor;

  var incomingUpperRadiance = vec3<f32>(0.0);
  for (var b = 0u; b < branchingFactor; b = b + 1u) {
    let uRay = baseUpperRayIdx + b;
    let upperCoord = vec2<u32>(id.x + uRay * dims.x, id.y);
    let upperSample = textureLoad(upperCascade, upperCoord);
    incomingUpperRadiance = incomingUpperRadiance + upperSample.xyz;
  }
  incomingUpperRadiance = incomingUpperRadiance / f32(branchingFactor);

  // Merge radiance: L_total = L_local + Transmittance * L_upper
  let mergedRadiance = localSample.xyz + localSample.w * incomingUpperRadiance;

  textureStore(currentCascade, storeCoord, vec4<f32>(mergedRadiance, localSample.w));
}
`;
