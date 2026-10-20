// Standalone MSN transparency/instance baseline. Headless numbers are relative only.
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
    views: 'front,three_quarter',
    lights: 'day,night',
    instances,
    backdrop: 'checker',
    nearFactor: 1.0,
    farFactor: 2.5,
    width: 1440,
    height: 900,
  });
  const record = {
    instances,
    status: result.status,
    benchmark: result.benchmark,
    report: result.report,
    captures: result.captures,
    pageErrors: result.pageErrors,
    reason: result.reason,
  };
  writeFileSync(join(directory, `baseline-${instances}.json`),
    JSON.stringify(record, null, 2));
  results.push(record);
  console.log(`MSN ${instances}: ${result.status} ` +
    `(${result.benchmark?.averageMs?.toFixed(2) || '?'} ms/frame, ` +
    `${result.report?.renderer?.calls || '?'} calls)`);
}
writeFileSync(join(out, 'summary.json'), JSON.stringify({
  note: 'Headless relative comparison only; not real-GPU or full-game performance.',
  results: results.map(result => ({
    instances: result.instances,
    status: result.status,
    benchmark: result.benchmark,
    calls: result.report?.renderer?.calls,
    triangles: result.report?.renderer?.triangles,
    textures: result.report?.renderer?.textures,
    renderer: result.report?.renderer || null,
    camera: result.report?.camera || null,
    errors: result.pageErrors,
  })),
}, null, 2));
console.log(join(out, 'summary.json'));
