import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { inspectGlbBytes } from '../../../scripts/glb-inventory.mjs';
import {
  createReport, sectionWithStatus, finding, statusFromFindings,
  compareInventories, validateReport,
} from '../scripts/verification_report.mjs';
import {
  findValidatorDir, validateGlb, VALIDATOR_PACKAGE,
} from '../scripts/validator.mjs';
import {
  validTriangleGlb, emissiveTriangleGlb, externalImageGlb,
  unsupportedExtensionGlb, invalidAccessorGlb, malformedGlb,
} from './fixtures.mjs';

const validatorDir = findValidatorDir();

function reportSections(overrides = {}) {
  const names = [
    'identity', 'structure', 'validator', 'dependencies',
    'clean_import', 'preview', 'visual', 'resources',
  ];
  return Object.fromEntries(names.map(name => [name,
    sectionWithStatus({ status: 'pass', ...(overrides[name] || {}) })]));
}

function report(overrides = {}) {
  return createReport({
    asset: { path: 'fixture.glb', sha256: 'a'.repeat(64), bytes: 10 },
    sections: reportSections(overrides),
    captures: [],
    generatedAt: '2026-10-20T00:00:00.000Z',
  });
}

test('report contract rejects missing sections and accepts a valid report', () => {
  const value = report();
  assert.equal(value.disposition.status, 'pass');
  assert.equal(validateReport(value), true);
  const broken = structuredClone(value);
  delete broken.sections.validator;
  assert.throws(() => validateReport(broken), /missing section/);
});

test('unverified and review statuses do not become pass', () => {
  const value = report({
    validator: { status: 'unverified', findings: [] },
    visual: { status: 'review', findings: [finding('warning', 'inspect', 'pending')] },
  });
  assert.equal(value.disposition.status, 'unverified');
});

test('finding severities map to section status', () => {
  assert.equal(statusFromFindings([finding('error', 'x', 'x')]), 'fail');
  assert.equal(statusFromFindings([finding('warning', 'x', 'x')]), 'review');
  assert.equal(statusFromFindings([]), 'pass');
});

test('captures require a hash-linked path', () => {
  const value = createReport({
    asset: { path: 'fixture.glb', sha256: 'a'.repeat(64), bytes: 10 },
    sections: reportSections(),
    captures: [{ path: 'front.png', sha256: 'b'.repeat(64), view: 'front', light: 'day' }],
    generatedAt: '2026-10-20T00:00:00.000Z',
  });
  assert.equal(value.captures.length, 1);
  assert.throws(() => validateReport({
    ...value,
    captures: [{ path: 'front.png' }],
  }), /path and sha256/);
});

test('node and python inventories compare by normalized fields', () => {
  const node = inspectGlbBytes(validTriangleGlb(), { file: 'valid.glb' });
  const python = {
    bytes: node.bytes,
    unique_mesh_primitive_vertices: node.vertices,
    unique_mesh_primitive_triangles: node.triangles,
    material_count: node.materialCount,
    image_count: node.imageCount,
    skin_count: node.skinCount,
    animation_count: node.animationCount,
    extensions_used: node.extensionsUsed,
    external_uris: node.externalUris,
  };
  assert.equal(compareInventories(node, python).agreement, true);
  python.material_count += 1;
  assert.equal(compareInventories(node, python).agreement, false);
});

test('GLB fixtures expose expected identity and dependency signals', () => {
  assert.ok(inspectGlbBytes(validTriangleGlb()).triangles >= 1);
  assert.deepEqual(
    inspectGlbBytes(emissiveTriangleGlb()).extensionsRequired,
    ['KHR_materials_emissive_strength']);
  assert.deepEqual(
    inspectGlbBytes(externalImageGlb()).externalUris,
    ['missing-texture.png']);
  assert.deepEqual(
    inspectGlbBytes(unsupportedExtensionGlb()).extensionsRequired,
    ['EXT_fixture_unknown']);
  assert.throws(() => inspectGlbBytes(malformedGlb()), /GLB|expected|truncated/i);
});

test('pinned validator is either verified or explicitly unverified', async (t) => {
  if (!validatorDir) {
    t.skip(`${VALIDATOR_PACKAGE} is not provisioned; validator adapter must report unverified.`);
    return;
  }
  assert.ok(existsSync(join(validatorDir, 'module.mjs')));
  const valid = await validateGlb(validTriangleGlb(), {
    validatorDir, uri: 'valid.glb',
  });
  assert.ok(['pass', 'review'].includes(valid.status), JSON.stringify(valid));
  const invalid = await validateGlb(invalidAccessorGlb(), {
    validatorDir, uri: 'invalid.glb',
  });
  assert.equal(invalid.status, 'fail');
  const unsupported = await validateGlb(unsupportedExtensionGlb(), {
    validatorDir, uri: 'unsupported.glb',
  });
  assert.ok(['fail', 'review'].includes(unsupported.status), JSON.stringify(unsupported));
});
