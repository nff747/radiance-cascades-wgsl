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

  /**
   * Updates resolution and exposure parameters on an existing shader material uniform map.
   */
  public static updateUniforms(
    uniforms: { exposure?: { value: number }; resolution?: { value: [number, number] } },
    exposure: number,
    width: number,
    height: number
  ): void {
    if (uniforms.exposure) {
      uniforms.exposure.value = Math.max(0.01, exposure);
    }
    if (uniforms.resolution) {
      uniforms.resolution.value = [Math.max(1, width), Math.max(1, height)];
    }
  }

  /**
   * Formats 2D point light sources into compact Float32Array uniform buffer payload.
   * Format per light: [posX, posY, radius, intensity, colorR, colorG, colorB, 0.0] (32 bytes per light).
   */
  public static packLightBuffer(
    lights: { position: [number, number]; radius: number; intensity: number; color: [number, number, number] }[]
  ): Float32Array {
    const buffer = new Float32Array(lights.length * 8);
    for (let i = 0; i < lights.length; i++) {
      const l = lights[i];
      const offset = i * 8;
      buffer[offset + 0] = l.position[0];
      buffer[offset + 1] = l.position[1];
      buffer[offset + 2] = l.radius;
      buffer[offset + 3] = l.intensity;
      buffer[offset + 4] = l.color[0];
      buffer[offset + 5] = l.color[1];
      buffer[offset + 6] = l.color[2];
      buffer[offset + 7] = 0.0; // 16-byte alignment padding
    }
    return buffer;
  }
}

