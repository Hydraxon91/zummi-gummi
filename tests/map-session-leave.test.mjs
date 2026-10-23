import test from 'node:test';
import assert from 'node:assert/strict';
import { leaveCurrentMap } from '../src/mapsession.js';

function makeState({ possessed = true } = {}) {
  return {
    possessed,
    grabs: new Map([['grab-a', { uid: 4 }], ['grab-b', { uid: 7 }]]),
    pointers: new Map([[1, { id: 1 }], [2, { id: 2 }]]),
    dropQueue: [{ id: 1 }, { id: 2 }],
    actors: [{ uid: 4 }, { uid: 7 }],
    glass: [{ uid: 11 }, { uid: 12 }],
    camera: { yaw: 0.5, dist: 6 },
    saveDirty: false,
    uidFloor: 13,
  };
}

function harness(state, { initial = false, possessed = state.possessed, failAt = null } = {}) {
  const events = [];
  const seen = {};
  const fail = name => {
    if (failAt === name) throw new Error(`${name} failed`);
  };
  const opts = {
    initial,
    possessed,
    onExitPossession() {
      events.push('exit');
      seen.possessedAtExit = state.possessed;
      state.possessed = false;
      fail('exit');
    },
    onReleaseGrabs() {
      events.push('grabs');
      state.grabs.clear();
      fail('grabs');
    },
    onClearPointers() {
      events.push('pointers');
      state.pointers.clear();
      fail('pointers');
    },
    onClearDropQueue() {
      events.push('dropQueue');
      state.dropQueue.length = 0;
      fail('dropQueue');
    },
    onDespawnActors() {
      events.push('actors');
      state.actors.length = 0;
      fail('actors');
    },
    onClearGlass() {
      events.push('glass');
      state.glass.length = 0;
      fail('glass');
    },
  };
  return { events, seen, opts };
}

test('an initial activation leaves without invoking any callback', () => {
  const state = makeState();
  const { events, opts } = harness(state, { initial: true });
  const before = structuredClone(state);

  assert.equal(leaveCurrentMap(opts), false);
  assert.deepEqual(events, []);
  assert.deepEqual(state, before);
});

test('non-initial leave runs every callback once in the recorded order', () => {
  const state = makeState();
  const { events, seen, opts } = harness(state);

  assert.equal(leaveCurrentMap(opts), true);
  assert.deepEqual(events, ['exit', 'grabs', 'pointers', 'dropQueue', 'actors', 'glass']);
  assert.equal(seen.possessedAtExit, true);
  assert.equal(state.possessed, false);
  assert.equal(state.grabs.size, 0);
  assert.equal(state.pointers.size, 0);
  assert.deepEqual(state.dropQueue, []);
  assert.deepEqual(state.actors, []);
  assert.deepEqual(state.glass, []);
});

test('an unpossessed leave skips only the possession callback', () => {
  const state = makeState({ possessed: false });
  const { events, opts } = harness(state);

  assert.equal(leaveCurrentMap(opts), true);
  assert.deepEqual(events, ['grabs', 'pointers', 'dropQueue', 'actors', 'glass']);
  assert.equal(state.grabs.size, 0);
  assert.deepEqual(state.actors, []);
  assert.deepEqual(state.glass, []);
});

test('a throwing callback stops later steps without rolling back earlier mutations', () => {
  const state = makeState();
  const { events, opts } = harness(state, { failAt: 'grabs' });

  assert.throws(() => leaveCurrentMap(opts), /grabs failed/);
  assert.deepEqual(events, ['exit', 'grabs']);
  assert.equal(state.possessed, false, 'the earlier possession exit is kept');
  assert.equal(state.grabs.size, 0, 'the throwing callback may have partially mutated');
  assert.equal(state.pointers.size, 2, 'later clearing did not run');
  assert.equal(state.dropQueue.length, 2);
  assert.equal(state.actors.length, 2);
  assert.equal(state.glass.length, 2);
});

test('repeated calls are caller-controlled with no internal latch', () => {
  const state = makeState();
  const first = harness(state);
  assert.equal(leaveCurrentMap(first.opts), true);
  assert.deepEqual(first.events, ['exit', 'grabs', 'pointers', 'dropQueue', 'actors', 'glass']);

  // The caller, not the module, decides possession state on the next leave.
  const second = harness(state, { possessed: false });
  assert.equal(leaveCurrentMap(second.opts), true);
  assert.deepEqual(second.events, ['grabs', 'pointers', 'dropQueue', 'actors', 'glass']);
  assert.equal(state.possessed, false);
});

test('leave draws no RNG and mutates no unrelated session state', () => {
  const state = makeState();
  const cameraBefore = structuredClone(state.camera);
  const { opts } = harness(state);
  const originalRandom = Math.random;
  let draws = 0;
  Math.random = () => {
    draws++;
    return 0.5;
  };
  try {
    assert.equal(leaveCurrentMap(opts), true);
  } finally {
    Math.random = originalRandom;
  }
  assert.equal(draws, 0);
  assert.deepEqual(state.camera, cameraBefore);
  assert.equal(state.saveDirty, false);
  assert.equal(state.uidFloor, 13);
});
