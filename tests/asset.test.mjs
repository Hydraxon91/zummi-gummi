import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { inspectGlbBytes } from '../scripts/glb-inventory.mjs';

const glbUrl = new URL('../assets/MSN_Figure/msn.glb', import.meta.url);
const manifestUrl = new URL('../assets/MSN_Figure/asset.json', import.meta.url);

async function load() {
  const [glb, manifestText] = await Promise.all([
    readFile(glbUrl),
    readFile(manifestUrl, 'utf8'),
  ]);
  return {
    inventory: inspectGlbBytes(glb, { file: 'msn.glb' }),
    manifest: JSON.parse(manifestText),
  };
}

test('the MSN GLB matches its committed manifest', async () => {
  const { inventory, manifest } = await load();

  assert.equal(inventory.file, manifest.file);
  assert.equal(inventory.sha256, manifest.sha256);
  assert.equal(inventory.bytes, manifest.bytes);
  assert.equal(inventory.assetVersion, manifest.assetVersion);
  assert.equal(inventory.generator, manifest.generator);
  assert.equal(inventory.meshCount, manifest.meshCount);
  assert.deepEqual(inventory.meshNames, manifest.meshNames);
  assert.equal(inventory.vertices, manifest.vertices);
  assert.equal(inventory.triangles, manifest.triangles);
  assert.equal(inventory.skinCount, manifest.skinCount);
  assert.deepEqual(inventory.skins, manifest.skins);
  assert.equal(inventory.boneCount, manifest.boneCount);
  assert.equal(inventory.animationCount, manifest.animationCount);
  assert.deepEqual(inventory.animationNames, manifest.animationNames);
  assert.equal(inventory.materialCount, manifest.materialCount);
  assert.deepEqual(inventory.materialNames, manifest.materialNames);
  assert.equal(inventory.imageCount, manifest.imageCount);
  assert.deepEqual(inventory.extensionsUsed, manifest.extensionsUsed);
  assert.deepEqual(inventory.extensionsRequired, manifest.extensionsRequired);
  assert.deepEqual(inventory.externalUris, []);
});

test('the MSN GLB keeps the expected local bounds', async () => {
  const { inventory, manifest } = await load();
  assert.ok(inventory.bounds);
  assert.equal(inventory.bounds.space, manifest.bounds.space);
  for (const key of ['min', 'max']) {
    for (let i = 0; i < 3; i += 1) {
      assert.ok(Math.abs(inventory.bounds[key][i] - manifest.bounds[key][i]) < 1e-6);
    }
  }
});
