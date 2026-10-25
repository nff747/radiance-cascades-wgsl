import { describe, it, expect } from 'vitest';
import {
  CascadeMath,
  CPUReferenceCascades,
  CascadeOrchestrator,
  ThreeRadianceAdapter,
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

  it('should compute accurate ray directions and interval containment', () => {
    // 4 rays equidistant: 45, 135, 225, 315 degrees
    const dir0 = CascadeMath.getRayDirection(0, 4);
    expect(dir0[0]).toBeCloseTo(Math.cos(Math.PI / 4), 5);
    expect(dir0[1]).toBeCloseTo(Math.sin(Math.PI / 4), 5);

    // Vector length should be unit length 1.0
    const len = Math.hypot(dir0[0], dir0[1]);
    expect(len).toBeCloseTo(1.0, 5);

    // Interval checks
    expect(CascadeMath.isWithinInterval(0.05, 0.02, 0.08)).toBe(true);
    expect(CascadeMath.isWithinInterval(0.01, 0.02, 0.08)).toBe(false);
    expect(CascadeMath.isWithinInterval(0.09, 0.02, 0.08)).toBe(false);
    expect(CascadeMath.isWithinInterval(0.02, 0.02, 0.08)).toBe(true);
  });

  it('should compute exact bilinear interpolation weights summing strictly to 1.0', () => {
    // Exact center (0.5, 0.5) -> all four weights = 0.25
    const centerWeights = CascadeMath.computeBilinearWeights(0.5, 0.5);
    expect(centerWeights[0]).toBeCloseTo(0.25);
    expect(centerWeights[1]).toBeCloseTo(0.25);
    expect(centerWeights[2]).toBeCloseTo(0.25);
    expect(centerWeights[3]).toBeCloseTo(0.25);

    // Sum invariant
    const sum = centerWeights.reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0, 6);

    // Interpolate radiance vector: corner (1.0, 0.0) selects c10
    const c00: [number, number, number] = [1, 0, 0];
    const c10: [number, number, number] = [0, 1, 0];
    const c01: [number, number, number] = [0, 0, 1];
    const c11: [number, number, number] = [1, 1, 1];
    const interp10 = CascadeMath.interpolateRadiance(c00, c10, c01, c11, 1.0, 0.0);
    expect(interp10[0]).toBeCloseTo(0.0);
    expect(interp10[1]).toBeCloseTo(1.0);
    expect(interp10[2]).toBeCloseTo(0.0);

    // Center interpolation
    const interpMid = CascadeMath.interpolateRadiance(c00, c10, c01, c11, 0.5, 0.5);
    expect(interpMid[0]).toBeCloseTo(0.5);
    expect(interpMid[1]).toBeCloseTo(0.5);
    expect(interpMid[2]).toBeCloseTo(0.5);
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

  it('should evaluate directional radiance with cosine weighting towards normal vector', () => {
    const levels = CascadeMath.generateCascadeLevels(3, 0.05, 4.0);

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

    // Normal pointing towards light (+X, +Y) from probe at [0.2, 0.0]
    const facingLight = CPUReferenceCascades.solveDirectionalRadiance(
      sampleSceneFn,
      [0.2, 0.0],
      [Math.cos(angle0), Math.sin(angle0)],
      levels
    );
    expect(facingLight[0]).toBeGreaterThan(0.0);

    // Normal pointing away from light (-X, -Y) from probe at [0.2, 0.0]
    const facingAway = CPUReferenceCascades.solveDirectionalRadiance(
      sampleSceneFn,
      [0.2, 0.0],
      [-Math.cos(angle0), -Math.sin(angle0)],
      levels
    );
    expect(facingAway[0]).toBe(0.0);
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

  it('should calculate accurate VRAM texture memory footprint and handle resize', () => {
    const orchestrator = new CascadeOrchestrator({ numCascades: 3 });
    // Resolution: 800 x 600
    // L0: 800 * 4 * 600 * 8 = 15,360,000 bytes
    // L1: 800 * 16 * 600 * 8 = 61,440,000 bytes
    // L2: 800 * 64 * 600 * 8 = 245,760,000 bytes
    // Output: 800 * 600 * 4 = 1,920,000 bytes
    // Total = 324,480,000 bytes (~309.4 MB)
    const vramBytes = orchestrator.calculateTotalVRAMBytes();
    expect(vramBytes).toBe(324480000);

    // Dynamic resize
    orchestrator.resize(1024, 768);
    expect(orchestrator.width).toBe(1024);
    expect(orchestrator.height).toBe(768);

    // Negative / zero dimensions should throw RangeError
    expect(() => orchestrator.resize(-100, 600)).toThrow(RangeError);
    expect(() => orchestrator.resize(800, 0)).toThrow(RangeError);
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

  it('should generate valid Three.js shader pass definition and pack light buffers', () => {
    const orchestrator = new CascadeOrchestrator({ numCascades: 3 });
    const passDef = ThreeRadianceAdapter.createShaderPassDefinition(orchestrator);

    expect(passDef.uniforms.tDiffuse.value).toBeNull();
    expect(passDef.uniforms.exposure.value).toBeCloseTo(1.4);
    expect(passDef.uniforms.resolution.value).toEqual([orchestrator.width, orchestrator.height]);
    expect(passDef.vertexShader).toContain('varying vec2 vUv;');
    expect(passDef.fragmentShader).toContain('acesFilm');

    // Uniform updater
    ThreeRadianceAdapter.updateUniforms(passDef.uniforms, 2.5, 1920, 1080);
    expect(passDef.uniforms.exposure.value).toBeCloseTo(2.5);
    expect(passDef.uniforms.resolution.value).toEqual([1920, 1080]);

    // Light buffer packing
    const lights = [
      {
        position: [0.5, -0.2] as [number, number],
        radius: 0.15,
        intensity: 5.0,
        color: [1.0, 0.8, 0.6] as [number, number, number],
      },
    ];
    const packed = ThreeRadianceAdapter.packLightBuffer(lights);
    expect(packed.length).toBe(8); // 8 floats per light
    expect(packed[0]).toBeCloseTo(0.5);
    expect(packed[1]).toBeCloseTo(-0.2);
    expect(packed[2]).toBeCloseTo(0.15);
    expect(packed[3]).toBeCloseTo(5.0);
    expect(packed[4]).toBeCloseTo(1.0);
    expect(packed[5]).toBeCloseTo(0.8);
    expect(packed[6]).toBeCloseTo(0.6);
    expect(packed[7]).toBe(0.0); // 16-byte alignment
  });
});

