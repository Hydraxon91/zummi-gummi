import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  validateAssetManifest,
  gltfInventory,
  loadManifestedGltf,
} from '../src/assets.js';

const manifest = JSON.parse(await readFile(
  new URL('../assets/MSN_Figure/asset.json', import.meta.url),
  'utf8',
));

function fakeGltf() {
  const material = { name: 'MSN Buddy' };
  const meshes = [
    { isMesh: true, material },
    { isMesh: true, material },
    {
      isMesh: true,
      isSkinnedMesh: true,
      material,
      skeleton: { bones: Array.from({ length: 9 }, (_, i) => ({ name: `bone-${i}` })) },
    },
  ];
  return {
    scene: { traverse(visit) { for (const mesh of meshes) visit(mesh); } },
    animations: Array.from({ length: 10 }, (_, i) => ({ name: `Clip${i}` })),
  };
}

test('the manifest validator accepts the shipped manifest', () => {
  assert.equal(validateAssetManifest(manifest).ok, true);
});

test('the manifest validator rejects schema and path violations', () => {
  const invalid = {
    ...manifest,
    schema: 2,
    file: '../outside.glb',
    sha256: 'not-a-hash',
  };
  const check = validateAssetManifest(invalid);
  assert.equal(check.ok, false);
  assert.ok(check.errors.length >= 3);
});

test('the loader resolves the GLB beside the manifest and verifies counts', async () => {
  let requested = null;
  const result = await loadManifestedGltf(manifest, {
    manifestUrl: 'https://example.test/assets/MSN_Figure/asset.json',
    load: async url => {
      requested = url;
      return fakeGltf();
    },
  });

  assert.equal(requested, 'https://example.test/assets/MSN_Figure/msn.glb');
  assert.equal(result.url, requested);
  assert.equal(result.inventory.meshCount, manifest.meshCount);
  assert.equal(result.inventory.boneCount, manifest.boneCount);
  assert.equal(result.inventory.materialCount, manifest.materialCount);
  assert.equal(result.inventory.animationCount, manifest.animationCount);
});

test('a mismatched GLB inventory is rejected', async () => {
  const wrong = fakeGltf();
  wrong.scene.traverse = visit => visit({ isMesh: true, material: { name: 'only' } });
  await assert.rejects(
    loadManifestedGltf(manifest, {
      manifestUrl: 'https://example.test/assets/MSN_Figure/asset.json',
      load: async () => wrong,
    }),
    /Asset manifest mismatch: meshCount/,
  );
});

test('gltfInventory counts skinned bones and unique materials', () => {
  const inventory = gltfInventory(fakeGltf());
  assert.deepEqual(inventory, {
    meshCount: 3,
    boneCount: 9,
    materialCount: 1,
    animationCount: 10,
    animationNames: Array.from({ length: 10 }, (_, i) => `Clip${i}`),
  });
});
