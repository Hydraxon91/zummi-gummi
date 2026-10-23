import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createAssetStore } from '../src/assetstore.js';

const catalog = JSON.parse(await readFile(
  new URL('../assets/catalog.json', import.meta.url),
  'utf8',
));
const baseUrl = 'https://example.test/game/assets/';
const assetId = 'msn.glass';
const sourceValue = { gltf: { scene: { name: 'shared-source' } }, manifest: { bytes: 42 } };

function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function tick() {
  return new Promise(resolve => setImmediate(resolve));
}

test('coalesced consumers keep release caller-owned; cancellation releases once and pending sources stay', async () => {
  const ready = deferred();
  let calls = 0;
  let disposals = 0;
  const store = createAssetStore({ catalog, baseUrl,
    load: async (entry, url) => {
      calls++;
      assert.equal(entry.id, assetId);
      assert.equal(url, baseUrl + 'MSN_Figure/asset.json');
      return ready.promise;
    },
    dispose: () => { disposals++; } });

  // The store has no consumer-cancellation signal or consumer state; callers
  // model their own removal and are still responsible for releasing a lease
  // that resolves after the consumer is gone.
  assert.deepEqual(Object.keys(store).sort(),
    ['acquire', 'evictUnused', 'preloadGroup', 'status']);

  const first = store.acquire(assetId);
  const second = store.acquire(assetId);
  await tick();
  assert.equal(calls, 1);
  assert.equal(store.status()[0].state, 'loading');
  assert.equal(store.status()[0].refs, 2);
  assert.deepEqual(store.evictUnused(), []);

  const firstConsumer = { removed: true, model: null };

  ready.resolve(sourceValue);
  const [firstLease, secondLease] = await Promise.all([first, second]);
  assert.equal(firstLease.gltf, secondLease.gltf);
  assert.equal(firstConsumer.model, null);
  assert.equal(store.status()[0].refs, 2,
    'the store counts reservations until each caller releases');

  firstLease.release();
  firstLease.release();
  assert.equal(store.status()[0].refs, 1);
  assert.deepEqual(store.evictUnused(), []);

  secondLease.release();
  assert.equal(store.status()[0].refs, 0);
  assert.equal(store.status()[0].state, 'ready');
  assert.deepEqual(store.evictUnused(), [assetId]);
  assert.equal(disposals, 1);
  assert.equal(store.status()[0].state, 'unloaded');

  firstLease.release();
  secondLease.release();
  assert.equal(store.status()[0].refs, 0);
  assert.equal(disposals, 1);
});

test('late completion after consumer removal releases the lease (store-level simulation, not Glass host proof)', async () => {
  const ready = deferred();
  let calls = 0;
  let disposals = 0;
  const store = createAssetStore({ catalog, baseUrl,
    load: async () => { calls++; return ready.promise; },
    dispose: () => { disposals++; } });

  // This helper stands in for a consumer such as Glass: it checks its own
  // alive flag after the async lease resolves and releases immediately if the
  // consumer was removed. It is not a Glass host or browser test.
  const consumer = {
    removed: false,
    lease: null,
    model: null,
    late: false,
    lateLease: null,
  };
  consumer.done = store.acquire(assetId).then(lease => {
    if (consumer.removed) {
      consumer.late = true;
      consumer.lateLease = lease;
      lease.release();
      return null;
    }
    consumer.lease = lease;
    consumer.model = { gltf: lease.gltf };
    return consumer.model;
  });
  consumer.remove = () => {
    consumer.removed = true;
    consumer.model = null;
    if (consumer.lease) {
      consumer.lease.release();
      consumer.lease = null;
    }
  };

  await tick();
  assert.equal(calls, 1);
  assert.equal(store.status()[0].refs, 1);
  consumer.remove();
  assert.equal(consumer.model, null);

  ready.resolve(sourceValue);
  const model = await consumer.done;
  assert.equal(model, null);
  assert.equal(consumer.late, true);
  assert.equal(consumer.model, null);
  assert.equal(consumer.lease, null);
  assert.equal(store.status()[0].state, 'ready');
  assert.equal(store.status()[0].refs, 0,
    'the source remains cached-ready after the late release');

  assert.deepEqual(store.evictUnused(), [assetId]);
  assert.equal(disposals, 1);
  consumer.lateLease.release();
  assert.equal(store.status()[0].state, 'unloaded');
  assert.equal(disposals, 1, 'the late lease cannot release or dispose twice');
});

test('coalesced load failure rejects both consumers, clears refs/error and one retry succeeds', async () => {
  let calls = 0;
  let disposals = 0;
  const store = createAssetStore({ catalog, baseUrl,
    load: async () => {
      calls++;
      if (calls === 1) throw new Error('missing GLB');
      return sourceValue;
    },
    dispose: () => { disposals++; } });

  const first = { lease: null, model: null };
  const second = { lease: null, model: null };
  const start = consumer => {
    consumer.done = store.acquire(assetId).then(lease => {
      consumer.lease = lease;
      consumer.model = { gltf: lease.gltf };
      return consumer.model;
    });
  };
  start(first);
  start(second);

  const results = await Promise.allSettled([first.done, second.done]);
  assert.ok(results.every(item => item.status === 'rejected'));
  assert.ok(results.every(item => /missing GLB/.test(item.reason.message)));
  assert.equal(first.lease, null);
  assert.equal(first.model, null);
  assert.equal(second.lease, null);
  assert.equal(second.model, null);
  assert.equal(store.status()[0].refs, 0);
  assert.equal(store.status()[0].state, 'error');
  assert.equal(store.status()[0].error, 'missing GLB');
  assert.equal(store.status()[0].loads, 1);
  assert.equal(disposals, 0);

  const retry = await store.acquire(assetId);
  assert.equal(calls, 2);
  assert.equal(store.status()[0].loads, 2);
  assert.equal(store.status()[0].error, null);
  assert.equal(store.status()[0].state, 'ready');
  assert.equal(store.status()[0].refs, 1);
  retry.release();
  retry.release();
  assert.equal(store.status()[0].refs, 0);
  assert.deepEqual(store.evictUnused(), [assetId]);
  assert.equal(disposals, 1);
});

test('preload creates no lease and a ready unreferenced source is evicted once', async () => {
  let calls = 0;
  let disposals = 0;
  let disposedValue = null;
  const store = createAssetStore({ catalog, baseUrl,
    load: async () => { calls++; return sourceValue; },
    dispose: value => { disposals++; disposedValue = value; } });

  assert.deepEqual(await store.preloadGroup('meadow'), [assetId]);
  assert.equal(calls, 1);
  assert.equal(store.status()[0].state, 'ready');
  assert.equal(store.status()[0].refs, 0);

  const lease = await store.acquire(assetId);
  assert.equal(calls, 1, 'preloaded sources are reused without a second load');
  assert.equal(store.status()[0].refs, 1);
  lease.release();
  lease.release();
  assert.equal(store.status()[0].refs, 0);

  assert.deepEqual(store.evictUnused(), [assetId]);
  assert.equal(disposals, 1);
  assert.equal(disposedValue, sourceValue);
  assert.equal(store.status()[0].state, 'unloaded');
});
