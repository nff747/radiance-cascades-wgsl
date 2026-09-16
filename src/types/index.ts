/**
 * Core TypeScript definitions for the Radiance Cascades WebGPU engine.
 */

export interface CascadeLevelConfig {
  cascadeIndex: number;
  rayCount: number;
  intervalMin: number;
  intervalMax: number;
}

export interface RadianceCascadesConfig {
  numCascades?: number;
  baseInterval?: number; // r0, e.g. 0.02
  intervalScaling?: number; // e.g. 4.0
  angularScaling?: number; // e.g. 4.0
  exposure?: number;
  resolution?: [number, number];
}

export interface EmissiveLightSource {
  id: string;
  position: [number, number];
  radius: number;
  color: [number, number, number];
  intensity: number;
}

export interface CascadeTelemetry {
  frameTimeMs: number;
  raymarchLatencyMs: number;
  mergeLatencyMs: number;
  totalCascades: number;
  totalRaysPerProbe: number;
  fps: number;
}

export interface RadianceProbe {
  x: number;
  y: number;
  irradiance: [number, number, number];
}
