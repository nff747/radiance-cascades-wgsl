import { describe, it, expect } from 'vitest';
import {
  CascadeMath,
  CPUReferenceCascades,
  CascadeOrchestrator,
  sdfSceneShader,
  cascadeRaymarchShader,
  cascadeMergeShader,
  cascadeRenderShader,
} from '../src/index';

describe('CascadeMath Interval & Branching Formulations', () => {
  it('should generate contiguous geometric cascade levels with 4x branching', () => {
    const levels = CascadeMath.generateCascadeLevels(4, 0.02, 4.0);

    expect(levels.length).toBe(4);

    // Check ray counts: 4, 16, 64, 256
    expect(levels[0].rayCount).toBe(4);
    expect(levels[1].rayCount).toBe(16);
    expect(levels[2].rayCount).toBe(64);
    expect(levels[3].rayCount).toBe(256);

    // Check interval continuity: level[c].intervalMax == level[c+1].intervalMin
    for (let c = 0; c < levels.length - 1; c++) {
      expect(levels[c].intervalMax).toBeCloseTo(levels[c + 1].intervalMin);
      expect(levels[c].intervalMax).toBeGreaterThan(levels[c].intervalMin);
    }
  });

  it('should evaluate monotonic ACES filmic tonemapping clamped to [0, 1]', () => {
    expect(CascadeMath.acesFilm(0.0)).toBeCloseTo(0.0);
    expect(CascadeMath.acesFilm(1.0)).toBeGreaterThan(0.5);
    expect(CascadeMath.acesFilm(100.0)).toBeLessThanOrEqual(1.0);

    // Monotonicity test
    const low = CascadeMath.acesFilm(0.2);
    const mid = CascadeMath.acesFilm(0.8);
    const high = CascadeMath.acesFilm(2.5);
    expect(low).toBeLessThan(mid);
    expect(mid).toBeLessThan(high);
  });
});

describe('CPUReferenceCascades Hierarchical Light Transport', () => {
  it('should gather radiance from distant emissive source through cascades', () => {
    const levels = CascadeMath.generateCascadeLevels(3, 0.05, 4.0);

    // Position emissive orb at 45 degrees (along Cascade 0 ray 0 direction)
    const angle0 = Math.PI / 4.0;
    const lightDist = 0.4;
    const lightX = 0.2 + lightDist * Math.cos(angle0);
    const lightY = 0.0 + lightDist * Math.sin(angle0);

    const sampleSceneFn = (x: number, y: number) => {
      const dx = x - lightX;
      const dy = y - lightY;
      const dist = Math.hypot(dx, dy) - 0.25;
      return {
        dist,
        radiance: [2.0, 1.0, 0.5] as [number, number, number],
        isEmissive: true,
      };
    };



    // Probe close to the light at [0.2, 0.0]
    const closeRad = CPUReferenceCascades.solvePointRadiance(sampleSceneFn, [0.2, 0.0], levels);
    expect(closeRad[0]).toBeGreaterThan(0.0);


    // Probe further away at [-0.5, 0.0] should receive less irradiance
    const farRad = CPUReferenceCascades.solvePointRadiance(sampleSceneFn, [-0.5, 0.0], levels);
    expect(closeRad[0]).toBeGreaterThan(farRad[0]);
  });

  it('should cast shadow when an opaque occluder blocks the light path', () => {
    const levels = CascadeMath.generateCascadeLevels(3, 0.05, 4.0);

    // Emissive light at [0.6, 0.0], occluder at [0.3, 0.0]
    const sampleSceneFn = (x: number, y: number) => {
      const dLight = Math.hypot(x - 0.6, y) - 0.08;
      const dBlocker = Math.hypot(x - 0.3, y) - 0.15;

      if (dBlocker < dLight && dBlocker <= 0.0) {
        return { dist: dBlocker, radiance: [0, 0, 0] as [number, number, number], isEmissive: false };
      }
      if (dLight <= 0.0) {
        return { dist: dLight, radiance: [3.0, 3.0, 3.0] as [number, number, number], isEmissive: true };
      }
      return { dist: Math.min(dLight, dBlocker), radiance: [0, 0, 0] as [number, number, number], isEmissive: false };
    };

    // Probe behind the blocker at [0.0, 0.0]
    const shadowedRad = CPUReferenceCascades.solvePointRadiance(sampleSceneFn, [0.0, 0.0], levels);
    // Ray directly towards +X is blocked by occluder
    expect(shadowedRad[0]).toBe(0.0);
  });
});

describe('CascadeOrchestrator & WGSL Shaders Integrity', () => {
  it('should initialize orchestrator cascade levels', () => {
    const orchestrator = new CascadeOrchestrator({ numCascades: 4 });
    const lvls = orchestrator.getLevels();
    expect(lvls.length).toBe(4);
    expect(lvls[0].rayCount).toBe(4);
    expect(lvls[3].rayCount).toBe(256);
  });

  it('should contain valid WGSL compute entrypoints and shader symbols', () => {
    expect(sdfSceneShader).toContain('sampleScene');
    expect(sdfSceneShader).toContain('sdCircle');

    expect(cascadeRaymarchShader).toContain('@compute');
    expect(cascadeRaymarchShader).toContain('fn main');
    expect(cascadeRaymarchShader).toContain('CascadeUniforms');

    expect(cascadeMergeShader).toContain('@compute');
    expect(cascadeMergeShader).toContain('fn main');
    expect(cascadeMergeShader).toContain('MergeUniforms');

    expect(cascadeRenderShader).toContain('@compute');
    expect(cascadeRenderShader).toContain('fn main');
    expect(cascadeRenderShader).toContain('acesFilm');
  });
});
