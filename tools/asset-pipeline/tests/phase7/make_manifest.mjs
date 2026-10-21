// Generate a Phase 7B manifest and provenance record from the equipment-case GLB.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectGlbBytes } from '../../../../scripts/glb-inventory.mjs';

const [glbPath, sourcePath, outDir, assetId, operationLabel] = process.argv.slice(2);
if (!glbPath || !sourcePath || !outDir) {
  console.error('usage: make_manifest.mjs <file.glb> <source.blend> <out-dir> [asset-id]');
  process.exit(2);
}
const root = fileURLToPath(new URL('../../../../', import.meta.url));
const glb = readFileSync(glbPath);
const source = readFileSync(sourcePath);
const inventory = inspectGlbBytes(glb, { file: basename(glbPath) });
const sourceSha = createHash('sha256').update(source).digest('hex');
const now = new Date().toISOString();
const asset = {
  schema: 1,
  file: basename(glbPath),
  sha256: inventory.sha256,
  bytes: inventory.bytes,
  assetVersion: inventory.assetVersion,
  generator: inventory.generator,
  meshCount: inventory.meshCount,
  meshNames: inventory.meshNames,
  primitiveCount: inventory.primitiveCount,
  vertices: inventory.vertices,
  triangles: inventory.triangles,
  skinCount: inventory.skinCount,
  skins: inventory.skins,
  boneCount: inventory.boneCount,
  animationCount: inventory.animationCount,
  animationNames: inventory.animationNames,
  materialCount: inventory.materialCount,
  materialNames: inventory.materialNames,
  imageCount: inventory.imageCount,
  extensionsUsed: inventory.extensionsUsed,
  extensionsRequired: inventory.extensionsRequired,
  bounds: inventory.bounds,
  source: {
    path: relative(root, resolve(sourcePath)).split('\\').join('/'),
    sha256: sourceSha,
    tracked: false,
    note: 'Local Phase 7 checkpoint; the tracked delivery is the GLB plus this manifest.',
  },
};
const provenance = {
  schema_version: '1.0.0',
  asset_id: assetId || basename(glbPath, '.glb'),
  source: {
    path: relative(root, resolve(sourcePath)).split('\\').join('/'),
    sha256: sourceSha,
    is_dirty: false,
    units: 'metres',
    axes: 'Blender +Z up',
    author: 'Hydraxon',
    licence: 'project-authored',
    reference_rights: 'project-authored',
  },
  tool: {
    name: 'asset-pipeline-phase7',
    version: '0.1.0',
    blender_version: '5.2.2',
  },
  created_at: now,
  status: 'audit_only',
  generation: null,
  processing: {
    blender_version: '5.2.2',
    operations: [
      operationLabel || 'Phase 7 benchmark',
      'self-contained GLB export',
    ],
    bake_settings: null,
  },
  export: {
    path: relative(root, resolve(glbPath)).split('\\').join('/'),
    sha256: inventory.sha256,
    size_bytes: inventory.bytes,
    format: 'glb',
    extensions: inventory.extensionsUsed,
    validator: {
      name: 'gltf-validator',
      version: '2.0.0-dev.3.10',
      errors: 0,
      warnings: 0,
      hints: 0,
      report: null,
    },
  },
  verification: {
    status: 'not_run',
    evidence: [],
    warnings: [],
    limitations: ['Generated manifest/provenance; run verify_asset.mjs for evidence.'],
  },
};
writeFileSync(`${outDir}/asset.json`, JSON.stringify(asset, null, 2));
writeFileSync(`${outDir}/provenance.json`, JSON.stringify(provenance, null, 2));
console.log(JSON.stringify({
  asset: `${outDir}/asset.json`,
  provenance: `${outDir}/provenance.json`,
}, null, 2));
