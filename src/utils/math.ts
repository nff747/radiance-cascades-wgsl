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
}
