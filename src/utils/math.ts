/**
 * Mathematical utilities for Radiance Cascades interval derivation,
 * angular branching, and ACES tone mapping.
 */

import { CascadeLevelConfig } from '../types';

export class CascadeMath {
  /**
   * Generates hierarchical cascade interval bounds and ray counts.
   * Cascade c has rayCount = 4 * (4^c) and interval [r0 * 4^c, r0 * 4^(c+1)].
   */
  public static generateCascadeLevels(
    numCascades: number = 4,
    baseInterval: number = 0.02,
    scalingFactor: number = 4.0
  ): CascadeLevelConfig[] {
    const levels: CascadeLevelConfig[] = [];
    let currentMin = 0.0;
    let step = baseInterval;

    for (let c = 0; c < numCascades; c++) {
      const rayCount = 4 * Math.pow(scalingFactor, c);
      const intervalMin = currentMin;
      const intervalMax = currentMin + step;

      levels.push({
        cascadeIndex: c,
        rayCount,
        intervalMin,
        intervalMax,
      });

      currentMin = intervalMax;
      step *= scalingFactor;
    }

    return levels;
  }

  /**
   * Evaluates ACES filmic tone curve on RGB channels
   */
  public static acesFilm(x: number): number {
    const a = 2.51;
    const b = 0.03;
    const c = 2.43;
    const d = 0.59;
    const e = 0.14;
    const val = (x * (a * x + b)) / (x * (c * x + d) + e);
    return Math.max(0.0, Math.min(1.0, val));
  }

  /**
   * Gamma 2.2 correction
   */
  public static toSRGB(linear: number): number {
    return Math.pow(Math.max(0.0, linear), 1.0 / 2.2);
  }

  /**
   * Computes ray direction angle in radians for ray index r among rayCount rays.
   * Uses equidistant angular discretization theta_r = (r + 0.5) * (2 * PI / rayCount).
   */
  public static getRayAngle(rayIndex: number, rayCount: number): number {
    if (rayCount <= 0) return 0.0;
    const clampedIndex = Math.max(0, Math.min(rayIndex, rayCount - 1));
    return (clampedIndex + 0.5) * ((2.0 * Math.PI) / rayCount);
  }

  /**
   * Returns 2D normalized unit direction vector [cos(theta), sin(theta)] for a given ray.
   */
  public static getRayDirection(rayIndex: number, rayCount: number): [number, number] {
    const angle = CascadeMath.getRayAngle(rayIndex, rayCount);
    return [Math.cos(angle), Math.sin(angle)];
  }

  /**
   * Validates whether a spatial distance sample falls strictly within a cascade interval [min, max].
   */
  public static isWithinInterval(distance: number, intervalMin: number, intervalMax: number, epsilon: number = 1e-5): boolean {
    return distance >= intervalMin - epsilon && distance <= intervalMax + epsilon;
  }

  /**
   * Computes 2D bilinear interpolation weights [w00, w10, w01, w11] for normalized UV coordinate (u, v) in [0, 1].
   * Sum of all four weights strictly equals 1.0.
   */
  public static computeBilinearWeights(u: number, v: number): [number, number, number, number] {
    const s = Math.max(0.0, Math.min(1.0, u));
    const t = Math.max(0.0, Math.min(1.0, v));
    const w00 = (1.0 - s) * (1.0 - t);
    const w10 = s * (1.0 - t);
    const w01 = (1.0 - s) * t;
    const w11 = s * t;
    return [w00, w10, w01, w11];
  }

  /**
   * Bilinearly interpolates 4 radiance vectors [c00, c10, c01, c11] using coordinates (u, v).
   */
  public static interpolateRadiance(
    c00: [number, number, number],
    c10: [number, number, number],
    c01: [number, number, number],
    c11: [number, number, number],
    u: number,
    v: number
  ): [number, number, number] {
    const [w00, w10, w01, w11] = CascadeMath.computeBilinearWeights(u, v);
    return [
      c00[0] * w00 + c10[0] * w10 + c01[0] * w01 + c11[0] * w11,
      c00[1] * w00 + c10[1] * w10 + c01[1] * w01 + c11[1] * w11,
      c00[2] * w00 + c10[2] * w10 + c01[2] * w01 + c11[2] * w11,
    ];
  }
}


