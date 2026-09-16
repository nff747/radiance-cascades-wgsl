/**
 * WGSL Scene & Emissive Geometry Library for Radiance Cascades.
 * Computes signed distance fields and surface radiance (color + emission) for dynamic scene geometry.
 */

export const sdfSceneShader = /* wgsl */ `
struct SceneQueryResult {
  dist: f32,
  radiance: vec3<f32>,
  isEmissive: bool,
};

// 2D Circle Signed Distance
fn sdCircle(p: vec2<f32>, r: f32) -> f32 {
  return length(p) - r;
}

// 2D Box Signed Distance
fn sdBox2D(p: vec2<f32>, b: vec2<f32>) -> f32 {
  let d = abs(p) - b;
  return length(max(d, vec2<f32>(0.0))) + min(max(d.x, d.y), 0.0);
}

// 2D Segment / Capsule Signed Distance
fn sdSegment2D(p: vec2<f32>, a: vec2<f32>, b: vec2<f32>) -> f32 {
  let pa = p - a;
  let ba = b - a;
  let h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h);
}

// Evaluates the full scene at point p
fn sampleScene(p: vec2<f32>, time: f32) -> SceneQueryResult {
  var res: SceneQueryResult;
  res.dist = 1000.0;
  res.radiance = vec3<f32>(0.0);
  res.isEmissive = false;

  // 1. Moving central emissive light source (Cyan Neon Orb)
  let orbPos1 = vec2<f32>(sin(time * 1.2) * 0.45, cos(time * 0.9) * 0.35);
  let dOrb1 = sdCircle(p - orbPos1, 0.06);
  if (dOrb1 < res.dist) {
    res.dist = dOrb1;
    res.radiance = vec3<f32>(0.0, 3.2, 3.8); // High dynamic range cyan
    res.isEmissive = true;
  }

  // 2. Secondary moving emissive light (Hot Pink Laser Orb)
  let orbPos2 = vec2<f32>(cos(time * 1.5) * 0.55, sin(time * 1.1) * 0.4);
  let dOrb2 = sdCircle(p - orbPos2, 0.05);
  if (dOrb2 < res.dist) {
    res.dist = dOrb2;
    res.radiance = vec3<f32>(4.0, 0.2, 2.0); // High dynamic range magenta/pink
    res.isEmissive = true;
  }

  // 3. Central Obstacle (Rotated Rounded Cyber Pillar)
  let pillarP = p - vec2<f32>(0.0, 0.0);
  let rot = time * 0.2;
  let rotP = vec2<f32>(
    pillarP.x * cos(rot) - pillarP.y * sin(rot),
    pillarP.x * sin(rot) + pillarP.y * cos(rot)
  );
  let dPillar = sdBox2D(rotP, vec2<f32>(0.12, 0.12)) - 0.03;
  if (dPillar < res.dist) {
    res.dist = dPillar;
    res.radiance = vec3<f32>(0.02, 0.03, 0.05); // Non-emissive absorbing blocker
    res.isEmissive = false;
  }

  // 4. Perimeter Walls
  let dWallLeft   = p.x + 0.95;
  let dWallRight  = 0.95 - p.x;
  let dWallBottom = p.y + 0.95;
  let dWallTop    = 0.95 - p.y;
  let dBounds = -min(min(dWallLeft, dWallRight), min(dWallBottom, dWallTop));
  if (dBounds < res.dist && dBounds < 0.0) {
    res.dist = max(dBounds, 0.0);
    res.radiance = vec3<f32>(0.05, 0.08, 0.12);
    res.isEmissive = false;
  }

  return res;
}
`;
