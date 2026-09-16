/**
 * ThreeRadianceAdapter.ts
 * Adapter for Three.js rendering pipelines.
 * Binds Radiance Cascades output textures to custom ShaderMaterial screen quads.
 */

import { CascadeOrchestrator } from './CascadeOrchestrator';

export class ThreeRadianceAdapter {
  /**
   * Generates a Three.js-compatible fullscreen quad shader definition
   * that reads directly from the Cascade 0 integrated irradiance buffer.
   */
  public static createShaderPassDefinition(orchestrator: CascadeOrchestrator) {
    return {
      uniforms: {
        tDiffuse: { value: null },
        exposure: { value: 1.4 },
        resolution: { value: [orchestrator.width, orchestrator.height] },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D tDiffuse;
        uniform float exposure;
        varying vec2 vUv;

        vec3 acesFilm(vec3 x) {
          float a = 2.51;
          float b = 0.03;
          float c = 2.43;
          float d = 0.59;
          float e = 0.14;
          return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
        }

        void main() {
          vec4 color = texture2D(tDiffuse, vUv);
          vec3 mapped = acesFilm(color.rgb * exposure);
          gl_FragColor = vec4(pow(mapped, vec3(1.0 / 2.2)), 1.0);
        }
      `,
    };
  }
}
