import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAPS, STUDIO, FIELD,
  worlds as singletonWorlds, activeWorld as singletonActiveWorld,
  hydrateWorld, getActiveMap as singletonGetActiveMap,
  getWorldState as singletonGetWorldState,
  createWorldState,
} from '../src/world.js';

const STORE_KEY = 'gummy.worlds.v2';
const MAP_KEY = 'gummy.map';
const LEGACY_STUDIO_KEY = 'gummy.studio.launcher';

function createStorage(initial = {}) {
  const data = new Map();
  for (const [key, value] of Object.entries(initial)) {
    data.set(key, typeof value === 'string' ? value : JSON.stringify(value));
  }
  return {
    getItem(key) { return data.has(key) ? data.get(key) : null; },
    setItem(key, value) { data.set(key, String(value)); },
    removeItem(key) { data.delete(key); },
    read(key) { return data.has(key) ? data.get(key) : null; },
    json(key) {
      const raw = this.read(key);
      return raw == null ? null : JSON.parse(raw);
    },
  };
}

function getterFor(storage) {
  return () => storage;
}

test('world module import and factory construction do not access ambient storage', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    get() { throw new Error('ambient localStorage was read'); },
  });
  try {
    const mod = await import(`../src/world.js?isolated=${Date.now()}`);
    const state = mod.createWorldState();
    assert.equal(state.activeWorld.mapId, 'field');
    assert.equal(state.worlds.field.time, 7.0);
    assert.equal(state.worlds.studio.time, null);
    assert.deepEqual(state.worlds.field.launcher, { x: null, z: null });
    assert.deepEqual(state.worlds.studio.launcher, { x: null, z: null });
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
    else delete globalThis.localStorage;
  }
});

test('factory construction is lazy and throwing storage getters stay best-effort', () => {
  let calls = 0;
  const state = createWorldState({
    getStorage() {
      calls++;
      throw new Error('storage denied');
    },
  });
  assert.equal(calls, 0, 'factory construction must not resolve storage');
  assert.equal(state.worlds.field.time, 7.0);

  assert.doesNotThrow(() => state.hydrate());
  assert.ok(calls > 0, 'hydrate resolves the injected getter');
  assert.equal(state.worlds.field.time, 7.0);
  assert.doesNotThrow(() => state.persistWorld('field'));
  assert.doesNotThrow(() => state.saveLauncherPos(3, 4));
  assert.deepEqual(state.worlds[state.activeWorld.mapId].launcher, { x: 3, z: 4 });
  assert.doesNotThrow(() => state.setActiveMap('studio'));
  assert.equal(state.activeWorld.mapId, 'studio');
});

test('factory defaults preserve the current per-map state shape', () => {
  const state = createWorldState({ getStorage: () => null });
  assert.equal(state.worlds.studio.id, 'studio');
  assert.equal(state.worlds.field.id, 'field');
  assert.equal(state.worlds.studio.bears, null);
  assert.equal(state.worlds.field.bears, null);
  assert.deepEqual(state.worlds.studio.gifts, []);
  assert.deepEqual(state.worlds.field.gifts, []);
  assert.notEqual(state.worlds.studio.gifts, state.worlds.field.gifts);
  assert.equal(state.worlds.studio.initialized, false);
  assert.equal(state.worlds.field.initialized, false);
  assert.equal(state.worlds.studio.time, null);
  assert.equal(state.worlds.studio.auto, false);
  assert.equal(state.worlds.studio.speed, 1);
  assert.equal(state.worlds.field.time, 7.0);
  assert.equal(state.worlds.field.auto, true);
  assert.equal(state.worlds.field.speed, 1);
  assert.equal(state.activeWorld.mapId, 'field');
  assert.equal(state.activeWorld.state, state.worlds.field);
  assert.equal(state.activeWorld.launcher, state.worlds.field.launcher);
  assert.equal(state.getActiveMap(), FIELD);
  assert.equal(state.getWorldState(), state.worlds.field);
});

test('stored field preferences preserve finite/zero and truthiness behavior', () => {
  const store = createStorage({
    [STORE_KEY]: {
      field: { time: 0, auto: false, speed: 0 },
      studio: { time: 99, auto: true, speed: 9 },
    },
  });
  const state = createWorldState({ getStorage: getterFor(store) });
  assert.equal(state.worlds.field.time, 7.0, 'nothing is read before hydrate');

  state.hydrate();
  assert.equal(state.worlds.field.time, 0);
  assert.equal(state.worlds.field.auto, false);
  assert.equal(state.worlds.field.speed, 1, 'falsy stored speed keeps the legacy default');
  assert.equal(state.worlds.studio.time, null, 'saved Studio clock fields are ignored as before');
  assert.equal(state.worlds.studio.auto, false);
  assert.equal(state.worlds.studio.speed, 1);

  store.setItem(STORE_KEY, JSON.stringify({
    field: { time: '12', auto: 0, speed: 2 },
  }));
  state.hydrate();
  assert.equal(state.worlds.field.time, 7.0, 'non-finite stored time falls back to 7.0');
  assert.equal(state.worlds.field.auto, true, 'only an exact false disables auto');
  assert.equal(state.worlds.field.speed, 2);
});

test('launcher storage precedence keeps current record before the legacy Studio key', () => {
  const store = createStorage({
    [STORE_KEY]: {
      studio: { launcher: { x: 1.25, z: -1.5 } },
      field: { launcher: { x: -18, z: 22 } },
    },
    [LEGACY_STUDIO_KEY]: { x: 9, z: 9 },
  });
  const state = createWorldState({ getStorage: getterFor(store) });
  state.hydrate();
  assert.deepEqual(state.worlds.studio.launcher, { x: 1.25, z: -1.5 });
  assert.deepEqual(state.worlds.field.launcher, { x: -18, z: 22 });

  const legacyOnly = createStorage({
    [LEGACY_STUDIO_KEY]: { x: 9, z: 8 },
  });
  const legacyState = createWorldState({ getStorage: getterFor(legacyOnly) });
  legacyState.hydrate();
  assert.deepEqual(legacyState.worlds.studio.launcher, { x: 9, z: 8 });
  assert.deepEqual(legacyState.worlds.field.launcher, { x: null, z: null });

  const invalidCurrent = createStorage({
    [STORE_KEY]: { studio: { launcher: { x: '1', z: 2 } } },
    [LEGACY_STUDIO_KEY]: { x: 4, z: 5 },
  });
  const invalidState = createWorldState({ getStorage: getterFor(invalidCurrent) });
  invalidState.hydrate();
  assert.deepEqual(invalidState.worlds.studio.launcher, { x: 4, z: 5 });
});

test('malformed, non-object and missing storage fall back without throwing', () => {
  for (const raw of ['not json', '"text"', '[]']) {
    const state = createWorldState({
      getStorage: getterFor(createStorage({ [STORE_KEY]: raw })),
    });
    assert.doesNotThrow(() => state.hydrate(), raw);
    assert.deepEqual(state.worlds.field.launcher, { x: null, z: null });
    assert.equal(state.worlds.field.time, 7.0);
    assert.equal(state.worlds.field.auto, true);
    assert.equal(state.worlds.field.speed, 1);
  }

  const malformedLegacy = createWorldState({
    getStorage: getterFor(createStorage({ [LEGACY_STUDIO_KEY]: 'not json' })),
  });
  malformedLegacy.hydrate();
  assert.deepEqual(malformedLegacy.worlds.studio.launcher, { x: null, z: null });

  const missing = createWorldState({ getStorage: getterFor(createStorage()) });
  missing.hydrate();
  assert.equal(missing.activeWorld.mapId, 'field');
  assert.deepEqual(missing.worlds.field.launcher, { x: null, z: null });
});

test('throwing read and write methods keep in-memory state usable', () => {
  const denied = {
    getItem() { throw new Error('get denied'); },
    setItem() { throw new Error('set denied'); },
  };
  const state = createWorldState({ getStorage: () => denied });
  assert.doesNotThrow(() => state.hydrate());
  assert.equal(state.worlds.field.time, 7.0);
  assert.doesNotThrow(() => state.persistWorld('field'));
  assert.doesNotThrow(() => state.saveLauncherPos(6, 7));
  assert.deepEqual(state.worlds.field.launcher, { x: 6, z: 7 });
  assert.doesNotThrow(() => state.setActiveMap('studio'));
  assert.equal(state.activeWorld.mapId, 'studio');
  assert.equal(state.getActiveMap(), STUDIO);
});

test('invalid stored map ids fall back to field and setActiveMap rejects unknown ids', () => {
  for (const [stored, expected] of [
    ['bogus', 'field'],
    ['FIELD', 'field'],
    [null, 'field'],
    ['studio', 'studio'],
    ['field', 'field'],
  ]) {
    const initial = stored == null ? {} : { [MAP_KEY]: stored };
    const store = createStorage(initial);
    const state = createWorldState({ getStorage: getterFor(store) });
    state.hydrate();
    assert.equal(state.activeWorld.mapId, expected);
  }

  const store = createStorage({ [MAP_KEY]: 'studio' });
  const state = createWorldState({ getStorage: getterFor(store) });
  state.hydrate();
  assert.equal(state.setActiveMap('meadow'), 'studio');
  assert.equal(state.activeWorld.mapId, 'studio');
  assert.equal(store.read(MAP_KEY), 'studio');
  assert.equal(state.setActiveMap('field'), 'field');
  assert.equal(store.read(MAP_KEY), 'field');
});

test('persistWorld keeps unrelated keys and other world fields', () => {
  const store = createStorage({
    [STORE_KEY]: {
      untouched: 'keep',
      field: { keep: 7, extra: { a: 1 }, launcher: { x: 1, z: 2 }, time: 5, auto: false, speed: 3 },
      studio: { keep: 's' },
    },
    [MAP_KEY]: 'studio',
  });
  const state = createWorldState({ getStorage: getterFor(store) });
  state.hydrate();
  state.worlds.field.time = 9;
  state.worlds.field.auto = true;
  state.worlds.field.speed = 2;
  state.worlds.field.launcher = { x: 8, z: 9 };
  state.persistWorld('field');

  const stored = store.json(STORE_KEY);
  assert.equal(stored.untouched, 'keep');
  assert.equal(stored.field.keep, 7);
  assert.deepEqual(stored.field.extra, { a: 1 });
  assert.deepEqual(stored.field.launcher, { x: 8, z: 9 });
  assert.equal(stored.field.time, 9);
  assert.equal(stored.field.auto, true);
  assert.equal(stored.field.speed, 2);
  assert.deepEqual(stored.studio, { keep: 's' });
  assert.equal(store.read(MAP_KEY), 'studio');
});

test('persistWorld keeps the legacy best-effort boundary for unknown ids and cycles', () => {
  const store = createStorage({ [STORE_KEY]: { untouched: 'keep' } });
  const state = createWorldState({ getStorage: getterFor(store) });
  state.hydrate();
  const before = store.read(STORE_KEY);

  assert.doesNotThrow(() => state.persistWorld('missing'));
  assert.equal(store.read(STORE_KEY), before, 'an unknown id must not write');
  assert.equal(state.worlds.missing, undefined);

  const cyclic = { x: 1, z: 2 };
  cyclic.self = cyclic;
  state.worlds.field.launcher = cyclic;
  assert.doesNotThrow(() => state.persistWorld('field'));
  assert.equal(state.worlds.field.launcher, cyclic, 'failed persistence leaves memory intact');
  assert.equal(state.worlds.field.launcher.self, cyclic);
  assert.equal(store.read(STORE_KEY), before, 'serialization failure must not write');
});

test('saveLauncherPos updates memory, the store and the legacy Studio key', () => {
  const store = createStorage({
    [STORE_KEY]: { untouched: 'keep', studio: { keep: 's' } },
  });
  const state = createWorldState({ getStorage: getterFor(store) });
  state.hydrate();
  state.setActiveMap('studio');
  state.saveLauncherPos(-2.5, 3.5);

  assert.deepEqual(state.worlds.studio.launcher, { x: -2.5, z: 3.5 });
  const stored = store.json(STORE_KEY);
  assert.equal(stored.untouched, 'keep');
  assert.equal(stored.studio.keep, 's');
  assert.deepEqual(stored.studio.launcher, { x: -2.5, z: 3.5 });
  assert.deepEqual(store.json(LEGACY_STUDIO_KEY), { x: -2.5, z: 3.5 });
});

test('independent factory sessions do not share worlds, arrays or collaborators', () => {
  const storeA = createStorage({ [STORE_KEY]: { field: { time: 3 } } });
  const storeB = createStorage({ [STORE_KEY]: { field: { time: 4 } } });
  const a = createWorldState({ getStorage: getterFor(storeA) });
  const b = createWorldState({ getStorage: getterFor(storeB) });
  a.hydrate();
  b.hydrate();

  assert.notEqual(a.worlds, b.worlds);
  assert.notEqual(a.worlds.field, b.worlds.field);
  assert.notEqual(a.worlds.studio, b.worlds.studio);
  assert.notEqual(a.worlds.field.gifts, b.worlds.field.gifts);
  assert.notEqual(a.worlds.field.launcher, b.worlds.field.launcher);
  assert.notEqual(a.activeWorld, b.activeWorld);
  assert.equal(a.worlds.field.time, 3);
  assert.equal(b.worlds.field.time, 4);

  a.worlds.field.gifts.push({ id: 'only-a' });
  assert.equal(a.worlds.field.gifts.length, 1);
  assert.equal(b.worlds.field.gifts.length, 0);

  a.setActiveMap('studio');
  assert.equal(a.activeWorld.mapId, 'studio');
  assert.equal(b.activeWorld.mapId, 'field');

  a.saveLauncherPos(10, 11);
  assert.equal(storeB.read(STORE_KEY), JSON.stringify({ field: { time: 4 } }));
  assert.deepEqual(storeB.json(STORE_KEY), { field: { time: 4 } });
});

test('hydrate mutates stable exported references instead of replacing them', () => {
  const store = createStorage({
    [STORE_KEY]: { field: { time: 9 }, studio: { launcher: { x: 1, z: 2 } } },
    [MAP_KEY]: 'studio',
  });
  const state = createWorldState({ getStorage: getterFor(store) });
  const refs = {
    worlds: state.worlds,
    studio: state.worlds.studio,
    field: state.worlds.field,
    studioGifts: state.worlds.studio.gifts,
    fieldGifts: state.worlds.field.gifts,
    activeWorld: state.activeWorld,
  };

  state.hydrate();
  assert.equal(state.worlds, refs.worlds);
  assert.equal(state.worlds.studio, refs.studio);
  assert.equal(state.worlds.field, refs.field);
  assert.equal(state.worlds.studio.gifts, refs.studioGifts);
  assert.equal(state.worlds.field.gifts, refs.fieldGifts);
  assert.equal(state.activeWorld, refs.activeWorld);
  assert.equal(state.worlds.field.time, 9);
  assert.equal(state.activeWorld.mapId, 'studio');
  assert.equal(state.activeWorld.state, refs.studio);
});

test('default singleton exports keep stable references and composition getters', () => {
  const refs = {
    worlds: singletonWorlds,
    studio: singletonWorlds.studio,
    field: singletonWorlds.field,
    fieldGifts: singletonWorlds.field.gifts,
    activeWorld: singletonActiveWorld,
  };
  assert.equal(singletonActiveWorld.mapId, 'field');
  assert.equal(singletonActiveWorld.state, singletonWorlds.field);
  assert.equal(singletonGetActiveMap(), MAPS[singletonActiveWorld.mapId]);
  assert.equal(singletonGetWorldState(), singletonWorlds[singletonActiveWorld.mapId]);
  assert.doesNotThrow(() => hydrateWorld());
  assert.equal(singletonWorlds, refs.worlds);
  assert.equal(singletonWorlds.studio, refs.studio);
  assert.equal(singletonWorlds.field, refs.field);
  assert.equal(singletonWorlds.field.gifts, refs.fieldGifts);
  assert.equal(singletonActiveWorld, refs.activeWorld);
});
