/**
 * WebGPU Radiance Cascades Compute Orchestrator.
 * Manages texture cascades, compute pass dispatching, and screen rendering.
 */

import { CascadeLevelConfig, RadianceCascadesConfig } from '../types';
import { CascadeMath } from '../utils/math';
import { sdfSceneShader } from '../shaders/sdfScene.wgsl';
import { cascadeRaymarchShader } from '../shaders/cascadeRaymarch.wgsl';
import { cascadeMergeShader } from '../shaders/cascadeMerge.wgsl';
import { cascadeRenderShader } from '../shaders/cascadeRender.wgsl';

export class CascadeOrchestrator {
  private device: GPUDevice | null = null;
  public levels: CascadeLevelConfig[] = [];
  public width: number = 800;
  public height: number = 600;

  // GPU Textures for each cascade
  private cascadeTextures: GPUTexture[] = [];
  private outputTexture: GPUTexture | null = null;

  // Compute Pipelines
  private raymarchPipeline: GPUComputePipeline | null = null;
  private mergePipeline: GPUComputePipeline | null = null;
  private renderPipeline: GPUComputePipeline | null = null;

  constructor(config: RadianceCascadesConfig = {}) {
    const numCascades = config.numCascades ?? 4;
    const baseInterval = config.baseInterval ?? 0.02;
    this.levels = CascadeMath.generateCascadeLevels(numCascades, baseInterval, 4.0);
  }

  public async init(device: GPUDevice, width: number = 800, height: number = 600): Promise<void> {
    this.device = device;
    this.width = width;
    this.height = height;

    // 1. Raymarch Pipeline (combines scene + raymarcher)
    const raymarchCode = [sdfSceneShader, cascadeRaymarchShader].join('\n');
    const raymarchModule = device.createShaderModule({
      label: 'Cascade Raymarch Module',
      code: raymarchCode,
    });
    this.raymarchPipeline = device.createComputePipeline({
      label: 'Cascade Raymarch Pipeline',
      layout: 'auto',
      compute: { module: raymarchModule, entryPoint: 'main' },
    });

    // 2. Merge Pipeline
    const mergeModule = device.createShaderModule({
      label: 'Cascade Merge Module',
      code: cascadeMergeShader,
    });
    this.mergePipeline = device.createComputePipeline({
      label: 'Cascade Merge Pipeline',
      layout: 'auto',
      compute: { module: mergeModule, entryPoint: 'main' },
    });

    // 3. Render Pipeline
    const renderModule = device.createShaderModule({
      label: 'Cascade Render Module',
      code: cascadeRenderShader,
    });
    this.renderPipeline = device.createComputePipeline({
      label: 'Cascade Render Pipeline',
      layout: 'auto',
      compute: { module: renderModule, entryPoint: 'main' },
    });

    this.allocateTextures();
  }

  private allocateTextures(): void {
    if (!this.device) return;

    // Destroy old textures
    for (const tex of this.cascadeTextures) tex.destroy();
    this.cascadeTextures = [];
    if (this.outputTexture) this.outputTexture.destroy();

    // Allocate storage texture for each cascade: width * rayCount x height
    for (let c = 0; c < this.levels.length; c++) {
      const lvl = this.levels[c];
      const texWidth = this.width * lvl.rayCount;
      const tex = this.device.createTexture({
        label: `Cascade Texture L${c}`,
        size: [texWidth, this.height, 1],
        format: 'rgba16float',
        usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC,
      });
      this.cascadeTextures.push(tex);
    }

    // Allocate output display texture
    this.outputTexture = this.device.createTexture({
      label: 'Output Screen Texture',
      size: [this.width, this.height, 1],
      format: 'rgba8unorm',
      usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC,
    });
  }

  public getLevels(): readonly CascadeLevelConfig[] {
    return this.levels;
  }

  public getOutputTexture(): GPUTexture | null {
    return this.outputTexture;
  }
}
