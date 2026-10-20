import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  validTriangleGlb, emissiveTriangleGlb, externalImageGlb,
  unsupportedExtensionGlb, invalidAccessorGlb, malformedGlb,
} from '../fixtures.mjs';

const out = process.argv[2] || '.dev-shots/asset-pipeline/fixtures';
mkdirSync(out, { recursive: true });
const fixtures = {
  'valid.glb': validTriangleGlb(),
  'emissive.glb': emissiveTriangleGlb(),
  'external.glb': externalImageGlb(),
  'unsupported.glb': unsupportedExtensionGlb(),
  'invalid-accessor.glb': invalidAccessorGlb(),
  'malformed.glb': malformedGlb(),
};
for (const [name, bytes] of Object.entries(fixtures)) {
  writeFileSync(join(out, name), bytes);
}
console.log(JSON.stringify({ out, files: Object.keys(fixtures) }, null, 2));
