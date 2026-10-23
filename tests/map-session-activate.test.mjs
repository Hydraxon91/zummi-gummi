import test from 'node:test';
import assert from 'node:assert/strict';
import { enterMapSession } from '../src/mapsession.js';

const PHASES = [
  'enter',
  'configure',
  'camera',
  'reserve',
  'portions',
  'spawn',
  'glass',
  'sync',
];

function makeState() {
  return {
    activeMap: 'field',
    visualMap: null,
    bounds: null,
    camera: null,
    reservedWorld: null,
    portions: [],
    actors: [],
    glass: [],
    synced: false,
    unrelated: { saveDirty: false, uidFloor: 13 },
  };
}

function harness(state, { failAt = null } = {}) {
  const events = [];
  const seen = {};
  const fail = name => {
    if (failAt === name) throw new Error(`${name} failed`);
  };
  const options = {
    onEnter() {
      events.push('enter');
      state.activeMap = 'studio';
      state.visualMap = 'studio';
      fail('enter');
    },
    onConfigure() {
      events.push('configure');
      seen.mapAtConfigure = state.activeMap;
      seen.visualAtConfigure = state.visualMap;
      state.bounds = { hx: 4, hz: 2 };
      fail('configure');
    },
    onCamera() {
      events.push('camera');
      seen.boundsAtCamera = state.bounds;
      state.camera = { yaw: 1, dist: 6 };
      fail('camera');
    },
    onReserveUids() {
      events.push('reserve');
      seen.cameraAtReserve = state.camera;
      state.reservedWorld = { initialized: false };
      fail('reserve');
    },
    onRestorePortions() {
      events.push('portions');
      seen.worldInitializedAtPortions = state.reservedWorld.initialized;
      state.portions.push({ id: 'gift-1' });
      fail('portions');
    },
    onSpawnActors() {
      events.push('spawn');
      seen.portionsAtSpawn = state.portions.length;
      state.actors.push({ uid: 1 });
      fail('spawn');
    },
    onSyncGlass() {
      events.push('glass');
      seen.actorsAtGlass = state.actors.length;
      state.glass.push({ uid: 2 });
      fail('glass');
    },
    onSyncUi() {
      events.push('sync');
      seen.worldInitializedAtSync = state.reservedWorld.initialized;
      seen.glassAtSync = state.glass.length;
      state.reservedWorld.initialized = true;
      state.synced = true;
      fail('sync');
    },
  };
  return { events, seen, options };
}

test('every phase runs exactly once in the recorded order', () => {
  const state = makeState();
  const { events, options } = harness(state);

  assert.equal(enterMapSession(options), true);
  assert.deepEqual(events, PHASES);
  assert.equal(state.activeMap, 'studio');
  assert.equal(state.visualMap, 'studio');
  assert.deepEqual(state.bounds, { hx: 4, hz: 2 });
  assert.deepEqual(state.camera, { yaw: 1, dist: 6 });
  assert.equal(state.reservedWorld.initialized, true);
  assert.deepEqual(state.portions, [{ id: 'gift-1' }]);
  assert.deepEqual(state.actors, [{ uid: 1 }]);
  assert.deepEqual(state.glass, [{ uid: 2 }]);
  assert.equal(state.synced, true);
});

test('missing callbacks are no-ops and the remaining phases still run', () => {
  const events = [];
  const options = {
    onEnter: () => events.push('enter'),
    onCamera: () => events.push('camera'),
    onSpawnActors: () => events.push('spawn'),
    onSyncUi: () => events.push('sync'),
  };

  assert.equal(enterMapSession(options), true);
  assert.deepEqual(events, ['enter', 'camera', 'spawn', 'sync']);
  assert.equal(enterMapSession(), true);
});

test('setup from enter is visible to configure and each phase sees prior state', () => {
  const state = makeState();
  const { seen, options } = harness(state);

  assert.equal(enterMapSession(options), true);
  assert.equal(seen.mapAtConfigure, 'studio');
  assert.equal(seen.visualAtConfigure, 'studio');
  assert.deepEqual(seen.boundsAtCamera, { hx: 4, hz: 2 });
  assert.deepEqual(seen.cameraAtReserve, { yaw: 1, dist: 6 });
  assert.equal(seen.worldInitializedAtPortions, false);
  assert.equal(seen.portionsAtSpawn, 1);
  assert.equal(seen.actorsAtGlass, 1);
  assert.equal(seen.worldInitializedAtSync, false);
  assert.equal(seen.glassAtSync, 1);
});

test('a throwing callback stops later phases without rolling back earlier ones', () => {
  const state = makeState();
  const { events, options } = harness(state, { failAt: 'portions' });

  assert.throws(() => enterMapSession(options), /portions failed/);
  assert.deepEqual(events, ['enter', 'configure', 'camera', 'reserve', 'portions']);
  assert.equal(state.activeMap, 'studio', 'the earlier map switch is kept');
  assert.equal(state.visualMap, 'studio');
  assert.deepEqual(state.bounds, { hx: 4, hz: 2 });
  assert.deepEqual(state.camera, { yaw: 1, dist: 6 });
  assert.deepEqual(state.reservedWorld, { initialized: false });
  assert.deepEqual(state.actors, [], 'spawn did not run');
  assert.deepEqual(state.glass, [], 'Glass sync did not run');
  assert.equal(state.synced, false);
});

test('repeated calls are caller-controlled with no internal latch', () => {
  const state = makeState();
  const first = harness(state);
  assert.equal(enterMapSession(first.options), true);
  assert.deepEqual(first.events, PHASES);

  const second = harness(state);
  assert.equal(enterMapSession(second.options), true);
  assert.deepEqual(second.events, PHASES);
  assert.equal(state.portions.length, 2, 'the caller-supplied steps run again');
  assert.equal(state.actors.length, 2);
  assert.equal(state.glass.length, 2);
});

test('entry draws no RNG and mutates no unrelated session state', () => {
  const state = makeState();
  const unrelatedBefore = structuredClone(state.unrelated);
  const { options } = harness(state);
  const originalRandom = Math.random;
  let draws = 0;
  Math.random = () => {
    draws++;
    return 0.5;
  };
  try {
    assert.equal(enterMapSession(options), true);
  } finally {
    Math.random = originalRandom;
  }
  assert.equal(draws, 0);
  assert.deepEqual(state.unrelated, unrelatedBefore);
});
