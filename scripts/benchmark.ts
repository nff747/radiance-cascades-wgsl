/**
 * Micro-benchmark measuring raw Radiance Cascades interval and merge throughput.
 */

import { CascadeMath } from '../src/utils/math';
import { CPUReferenceCascades } from '../src/core/CPUReferenceCascades';

console.log('--- Radiance Cascades WGSL Light Transport Benchmark ---');

const levels = CascadeMath.generateCascadeLevels(4, 0.02, 4.0);

console.log('Cascade Hierarchy:');
for (const lvl of levels) {
  console.log(`  Cascade ${lvl.cascadeIndex}: ${lvl.rayCount} rays, interval [${lvl.intervalMin.toFixed(4)}, ${lvl.intervalMax.toFixed(4)}]`);
}

const sampleSceneFn = (x: number, y: number) => {
  const dLight1 = Math.hypot(x - 0.4, y - 0.3) - 0.15;
  const dLight2 = Math.hypot(x + 0.4, y + 0.2) - 0.12;
  const dBlocker = Math.hypot(x, y) - 0.2;

  if (dBlocker < Math.min(dLight1, dLight2) && dBlocker <= 0.0) {
    return { dist: dBlocker, radiance: [0, 0, 0] as [number, number, number], isEmissive: false };
  }
  if (dLight1 <= 0.0) {
    return { dist: dLight1, radiance: [3.5, 1.2, 0.4] as [number, number, number], isEmissive: true };
  }
  if (dLight2 <= 0.0) {
    return { dist: dLight2, radiance: [0.2, 2.5, 3.8] as [number, number, number], isEmissive: true };
  }

  return { dist: Math.min(dBlocker, Math.min(dLight1, dLight2)), radiance: [0, 0, 0] as [number, number, number], isEmissive: false };
};

const probesCount = 1000;
const start = performance.now();

for (let i = 0; i < probesCount; i++) {
  const px = (Math.random() - 0.5) * 1.6;
  const py = (Math.random() - 0.5) * 1.6;
  CPUReferenceCascades.solvePointRadiance(sampleSceneFn, [px, py], levels);
}

const end = performance.now();
const totalMs = end - start;
const msPerProbe = totalMs / probesCount;
const probesPerSec = probesCount / (totalMs / 1000);
const totalRaysSolved = probesCount * (4 + 16 + 64 + 256);

console.log('---------------------------------------------------------');
console.log(`  Probes Solved:     ${probesCount.toLocaleString()}`);
console.log(`  Total Rays Solved: ${totalRaysSolved.toLocaleString()}`);
console.log(`  Solve Latency:     ${msPerProbe.toFixed(3)} ms/probe`);
console.log(`  Throughput:        ${probesPerSec.toFixed(1)} probes/sec`);
console.log('---------------------------------------------------------');
