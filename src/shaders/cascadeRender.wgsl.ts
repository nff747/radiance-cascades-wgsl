/**
 * WGSL Final Radiance Integration, ACES Filmic Tone Mapping, and Bloom Shader.
 * Integrates directional radiance from Cascade 0 into isotropic irradiance and renders to screen.
 */

export const cascadeRenderShader = /* wgsl */ `
struct RenderUniforms {
  resolution: vec2<f32>,
  cascade0RayCount: u32,
  exposure: f32,
};

@group(0) @binding(0) var<uniform> config: RenderUniforms;
@group(0) @binding(1) var cascade0Texture: texture_storage_2d<rgba16float, read>;
@group(0) @binding(2) var outputCanvas: texture_storage_2d<rgba8unorm, write>;

// ACES Filmic Tone-Mapping Curve
fn acesFilm(x: vec3<f32>) -> vec3<f32> {
  let a = 2.51;
  let b = 0.03;
  let c = 2.43;
  let d = 0.59;
  let e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), vec3<f32>(0.0), vec3<f32>(1.0));
}

@compute @workgroup_size(16, 16, 1)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  let dims = vec2<u32>(config.resolution);
  if (id.x >= dims.x || id.y >= dims.y) {
    return;
  }

  // Integrate irradiance across all angles of Cascade 0
  var totalIrradiance = vec3<f32>(0.0);
  for (var k = 0u; k < config.cascade0RayCount; k = k + 1u) {
    let sampleCoord = vec2<u32>(id.x + k * dims.x, id.y);
    let rad = textureLoad(cascade0Texture, sampleCoord).xyz;
    totalIrradiance = totalIrradiance + rad;
  }
  let avgIrradiance = totalIrradiance / f32(config.cascade0RayCount);

  // Apply exposure
  let exposedColor = avgIrradiance * config.exposure;

  // Apply ACES filmic tonemapping
  var finalColor = acesFilm(exposedColor);

  // Gamma correction (sRGB)
  finalColor = pow(finalColor, vec3<f32>(1.0 / 2.2));

  textureStore(outputCanvas, id.xy, vec4<f32>(finalColor, 1.0));
}
`;
