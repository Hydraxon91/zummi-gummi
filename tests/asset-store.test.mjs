import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createAssetStore, validateAssetCatalog, disposeAssetSource,
  disposeInstanceSkeletons } from '../src/assetstore.js';
import { isAssetPath } from '../src/assets.js';

const catalog = JSON.parse(await readFile(new URL('../assets/catalog.json', import.meta.url), 'utf8'));
const baseUrl = 'https://example.test/game/assets/';

test('catalog and manifests reject escaping and external paths', () => {
  assert.equal(validateAssetCatalog(catalog)[0].id, 'msn.glass');
  for (const path of ['../x', '/x', 'https://host/x', 'nested/../x', 'a\\b',
    '%2e%2e/x', 'x?query', './x', ' x', '']) assert.equal(isAssetPath(path), false, path);
  assert.equal(isAssetPath('folder/asset.json'), true);
  assert.throws(() => validateAssetCatalog({ ...catalog,
    assets: [catalog.assets[0], catalog.assets[0]] }), /duplicate/);
  assert.throws(() => validateAssetCatalog({ schema: 2, assets: [] }), /catalog/);
});

test('concurrent leases coalesce loading; referenced and pending sources cannot be evicted', async () => {
  let calls = 0, finish, disposals = 0;
  const ready = new Promise(resolve => { finish = resolve; });
  const value = { gltf: { scene: {} }, manifest: { bytes: 42 } };
  const store = createAssetStore({ catalog, baseUrl,
    load: async (entry, url) => {
      calls++;
      assert.equal(url, baseUrl + 'MSN_Figure/asset.json');
      assert.equal(entry.id, 'msn.glass');
      return ready;
    }, dispose: () => { disposals++; } });
  const pending = [store.acquire('msn.glass'), store.acquire('msn.glass')];
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 1);
  assert.equal(store.status()[0].state, 'loading');
  assert.equal(store.status()[0].refs, 2);
  assert.deepEqual(store.evictUnused(), []);
  finish(value);
  const [a, b] = await Promise.all(pending);
  assert.equal(a.gltf, b.gltf);
  a.release(); a.release();
  assert.equal(store.status()[0].refs, 1);
  assert.deepEqual(store.evictUnused(), []);
  b.release();
  const nextLease = store.acquire('msn.glass');
  assert.deepEqual(store.evictUnused(), []);
  const c = await nextLease;
  assert.equal(calls, 1);
  c.release();
  assert.deepEqual(store.evictUnused(), ['msn.glass']);
  assert.equal(disposals, 1);
  assert.equal(store.status()[0].state, 'unloaded');
});

test('load failures release all leases, expose errors and can be retried', async () => {
  let calls = 0;
  const store = createAssetStore({ catalog, baseUrl,
    load: async () => { if (++calls === 1) throw new Error('missing GLB'); return { gltf: {} }; } });
  const result = await Promise.allSettled([store.acquire('msn.glass'), store.acquire('msn.glass')]);
  assert.ok(result.every(item => item.status === 'rejected'));
  assert.equal(store.status()[0].refs, 0);
  assert.equal(store.status()[0].error, 'missing GLB');
  assert.equal(store.status()[0].state, 'error');
  const lease = await store.acquire('msn.glass');
  assert.equal(store.status()[0].loads, 2);
  assert.equal(store.status()[0].error, null);
  lease.release();
  await assert.rejects(store.acquire('missing-id'), /Unknown asset/);
});

test('lazy catalog loading and preload groups do not retain phantom users', async () => {
  let catalogs = 0, loads = 0;
  const store = createAssetStore({ baseUrl,
    loadCatalog: async () => { catalogs++; return catalog; },
    load: async () => { loads++; return { gltf: {} }; } });
  assert.deepEqual(store.status(), []);
  await Promise.all([store.preloadGroup('meadow'), store.preloadGroup('studio')]);
  assert.equal(catalogs, 1);
  assert.equal(loads, 1);
  assert.equal(store.status()[0].refs, 0);
  const lease = await store.acquire('msn.glass');
  assert.equal(loads, 1);
  lease.release();
  assert.deepEqual(await store.preloadGroup('unused'), []);
});

test('source resource eviction deduplicates shared textures/materials; skeleton cleanup is separate', () => {
  const disposed = [];
  const resource = name => ({ dispose() { disposed.push(name); } });
  const texture = { ...resource('texture'), isTexture: true };
  const material = { ...resource('material'), map: texture, normalMap: texture };
  const geometry = resource('geometry');
  const skeleton = resource('skeleton');
  const scene = { traverse(fn) {
    fn({ geometry, material, skeleton }); fn({ geometry, material: [material], skeleton });
  } };
  disposeAssetSource({ gltf: { scene } });
  assert.deepEqual(disposed.sort(), ['geometry', 'material', 'skeleton', 'texture']);
  disposed.length = 0;
  disposeInstanceSkeletons(scene);
  assert.deepEqual(disposed, ['skeleton']);
});
