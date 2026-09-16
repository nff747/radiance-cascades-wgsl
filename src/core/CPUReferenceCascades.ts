/**
 * Headless CPU Reference Radiance Cascades Solver.
 * Verifies interval raymarching, occlusion, and hierarchical cascade merging.
 */

import { CascadeMath } from '../utils/math';
import { CascadeLevelConfig } from '../types';

export interface SceneHit {
  hit: boolean;
  radiance: [number, number, number];
  distance: number;
}

export class CPUReferenceCascades {
  public static solvePointRadiance(
    sampleSceneFn: (x: number, y: number) => { dist: number; radiance: [number, number, number]; isEmissive: boolean },
    probePos: [number, number],
    levels: CascadeLevelConfig[]
  ): [number, number, number] {
    // Array storing radiance for each ray in each cascade level
    // cascadesData[cascadeIndex][rayIndex] = { rad: [r, g, b], transmittance: t }
    const cascadesData: { rad: [number, number, number]; transmittance: number }[][] = [];

    // 1. Raymarch each cascade independently within its interval [intervalMin, intervalMax]
    for (let c = 0; c < levels.length; c++) {
      const lvl = levels[c];
      const rayResults: { rad: [number, number, number]; transmittance: number }[] = [];

      for (let k = 0; k < lvl.rayCount; k++) {
        const angle = (k + 0.5) * ((2.0 * Math.PI) / lvl.rayCount);
        const dirX = Math.cos(angle);
        const dirY = Math.sin(angle);

        let t = lvl.intervalMin;
        const maxT = lvl.intervalMax;
        let accRad: [number, number, number] = [0, 0, 0];
        let trans = 1.0;

        while (t < maxT) {
          const px = probePos[0] + dirX * t;
          const py = probePos[1] + dirY * t;
          const query = sampleSceneFn(px, py);

          if (query.dist < 0.002) {
            if (query.isEmissive) {
              accRad = [query.radiance[0], query.radiance[1], query.radiance[2]];
            }
            trans = 0.0;
            break;
          }

          t += Math.max(query.dist, 0.002);
        }

        rayResults.push({ rad: accRad, transmittance: trans });
      }

      cascadesData.push(rayResults);
    }

    // 2. Hierarchical Merging: from outer cascade (N-1) down to Cascade 0
    for (let c = levels.length - 2; c >= 0; c--) {
      const currentLevel = cascadesData[c];
      const upperLevel = cascadesData[c + 1];
      const branching = levels[c + 1].rayCount / levels[c].rayCount;

      for (let k = 0; k < levels[c].rayCount; k++) {
        const local = currentLevel[k];
        if (local.transmittance <= 0.001) continue;

        let upperAvgR = 0;
        let upperAvgG = 0;
        let upperAvgB = 0;

        const baseUpperIdx = k * branching;
        for (let b = 0; b < branching; b++) {
          const upperRay = upperLevel[baseUpperIdx + b];
          upperAvgR += upperRay.rad[0];
          upperAvgG += upperRay.rad[1];
          upperAvgB += upperRay.rad[2];
        }

        upperAvgR /= branching;
        upperAvgG /= branching;
        upperAvgB /= branching;

        local.rad[0] += local.transmittance * upperAvgR;
        local.rad[1] += local.transmittance * upperAvgG;
        local.rad[2] += local.transmittance * upperAvgB;
      }
    }

    // 3. Integrate final isotropic irradiance from Cascade 0
    const cascade0 = cascadesData[0];
    let totalR = 0;
    let totalG = 0;
    let totalB = 0;

    for (let k = 0; k < cascade0.length; k++) {
      totalR += cascade0[k].rad[0];
      totalG += cascade0[k].rad[1];
      totalB += cascade0[k].rad[2];
    }

    return [totalR / cascade0.length, totalG / cascade0.length, totalB / cascade0.length];
  }
}
