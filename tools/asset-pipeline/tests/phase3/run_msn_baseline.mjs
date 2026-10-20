// Standalone MSN transparency/instance baseline. Headless Mac run; timings are relative.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { capturePreview } from '../../scripts/preview_capture.mjs';

const baseUrl = process.env.PREVIEW_BASE_URL || 'http://localhost:8123';
const out = process.argv[2] || '.dev-shots/asset-pipeline/phase3/msn-baseline';
mkdirSync(out, { recursive: true });
const results = [];
for (const instances of [1, 8, 32]) {
  const directory = join(out, `instances-${instances}`);
  const result = await capturePreview({
    baseUrl,
    asset: 'assets/MSN_Figure/msn.glb',
    out: directory,
    views: 'front,back,left,right,three_quarter',
    lights: 'day,night',
    instances,
    backdrop: 'checker',
    nearFactor: 1.0,
    farFactor: 2.5,
    width: 1920,
    height: 1080,
    deviceScaleFactor: 1,
    headless: true,
    swiftshader: true,
  });
  const inventory = result.report?.inventory || {};
  const checks = {
    loaded: result.status === 'pass',
    geometryLayout: inventory.uniqueGeometryCount === 3
      && (instances === 1 || inventory.sharedGeometry === true),
    materialLayout: inventory.uniqueMaterialCount === 1
      && (instances === 1 || inventory.sharedMaterials === true),
    skeletonCount: (inventory.uniqueSkeletonCount || 0) >= instances,
    skeletonIndependence: inventory.skeletonIndependence?.ok === true
      && inventory.skeletonIndependence.sharedSkeletonCount === 0
      && inventory.skeletonIndependence.sharedBoneCount === 0,
    materialFlags: Array.isArray(result.report?.materials)
      && result.report.materials.every(material =>
        typeof material.side === 'number'
        && typeof material.transparent === 'boolean'
        && typeof material.depthWrite === 'boolean'
        && typeof material.depthTest === 'boolean'),
    viewport: result.report?.camera?.viewport?.[0] === 1920
      && result.report?.camera?.viewport?.[1] === 1080,
    dpr: result.report?.renderer?.devicePixelRatio === 1,
  };
  const passed = Object.values(checks).every(Boolean);
  const record = {
    instances,
    status: passed ? result.status : 'fail',
    checks,
    benchmark: result.benchmark,
    report: result.report,
    captures: result.captures,
    pageErrors: result.pageErrors,
    reason: result.reason,
  };
  writeFileSync(join(directory, `baseline-${instances}.json`),
    JSON.stringify(record, null, 2));
  results.push(record);
  console.log(`MSN ${instances}: ${record.status} ` +
    `(${result.benchmark?.averageMs?.toFixed(2) || '?'} ms/submission, ` +
    `${result.report?.renderer?.calls || '?'} calls, ` +
    `${inventory.uniqueGeometryCount || '?'} geometries)`);
  if (!passed) console.log('  checks', JSON.stringify(checks));
}
writeFileSync(join(out, 'summary.json'), JSON.stringify({
  note: 'Headless Mac baseline at 1920x1080, DPR 1. Timings are CPU submission/relative only, not GPU completion or full-game FPS. The renderer identifies as WebKit/WebKit WebGL and the GPU backend was not independently verified.',
  results: results.map(result => ({
    instances: result.instances,
    status: result.status,
    checks: result.checks,
    benchmark: result.benchmark,
    calls: result.report?.renderer?.calls,
    triangles: result.report?.renderer?.triangles,
    textures: result.report?.renderer?.textures,
    inventory: result.report?.inventory || null,
    materials: result.report?.materials || null,
    renderer: result.report?.renderer || null,
    camera: result.report?.camera || null,
    errors: result.pageErrors,
  })),
}, null, 2));
console.log(join(out, 'summary.json'));
