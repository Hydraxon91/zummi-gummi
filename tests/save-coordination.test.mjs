// D8/M12b save capture/apply phase coordination.
//
// These tests cover only the portable ordering facade. Save validation and
// migration remain the app's pre-phase step (`normalizeSave(raw)` before
// `applySavePayloadPhases`); the existing `save`, `saveformat` and `actorsave`
// tests own format/version/UID rules, so they are not duplicated here. The app
// supplies all concrete phases as callbacks; this module has no imports, RNG
// draws or asynchronous behavior.

import test from 'node:test';
import assert from 'node:assert/strict';
import { captureSavePayload, applySavePayloadPhases } from '../src/savecoordination.js';
import { normalizeSave } from '../src/save.js';

function withCaptureProbe(fn) {
  const original = Math.random;
  let draws = 0;
  Math.random = () => { draws++; return 0.5; };
  try {
    return { value: fn(), draws: () => draws };
  } finally {
    Math.random = original;
  }
}

test('capture calls the active-world capture once before building the payload', () => {
  const order = [];
  const result = captureSavePayload({
    captureActive: () => order.push('capture'),
    build: () => { order.push('build'); return { marker: 'payload' }; },
  });
  assert.deepEqual(result, { marker: 'payload' });
  assert.deepEqual(order, ['capture', 'build']);
});

test('capture skips building when the active-world capture throws', () => {
  const order = [];
  assert.throws(() => captureSavePayload({
    captureActive: () => { order.push('capture'); throw new Error('capture failed'); },
    build: () => { order.push('build'); return {}; },
  }), /capture failed/);
  assert.deepEqual(order, ['capture']);
});

test('capture with missing callbacks is a no-op', () => {
  assert.equal(captureSavePayload(), undefined);
  assert.equal(captureSavePayload({}), undefined);
});

test('capture draws no RNG', () => {
  const probe = withCaptureProbe(() => captureSavePayload({
    captureActive: () => {},
    build: () => ({ ok: true }),
  }));
  assert.deepEqual(probe.value, { ok: true });
  assert.equal(probe.draws(), 0);
});

test('apply calls every phase once in the approved order and passes the payload', () => {
  const order = [];
  const payload = { mapId: 'field' };
  const seen = [];
  const phases = {};
  for (const name of [
    'onReserveUids', 'onInstallWorlds', 'onPrune', 'onPortions', 'onActivate',
    'onRestoreCarried', 'onRestoreFood', 'onRestoreSky', 'onRestoreLauncher',
    'onFinish',
  ]) {
    phases[name] = value => {
      order.push(name);
      seen.push(value);
      if (name === 'onFinish') return 'finish-result';
      return undefined;
    };
  }
  const result = applySavePayloadPhases(payload, phases);
  assert.equal(result, 'finish-result');
  assert.deepEqual(order, [
    'onReserveUids', 'onInstallWorlds', 'onPrune', 'onPortions', 'onActivate',
    'onRestoreCarried', 'onRestoreFood', 'onRestoreSky', 'onRestoreLauncher',
    'onFinish',
  ]);
  assert.equal(seen.length, 10);
  for (const value of seen) assert.equal(value, payload);
});

test('apply returns the finish callback value and defaults to undefined', () => {
  assert.equal(applySavePayloadPhases({}, { onFinish: () => ({ ok: true, map: 'studio' }) })
    .map, 'studio');
  assert.equal(applySavePayloadPhases({}), undefined);
  assert.equal(applySavePayloadPhases({}, {}), undefined);
});

test('apply with missing phases is a no-op', () => {
  assert.doesNotThrow(() => applySavePayloadPhases({}));
  assert.doesNotThrow(() => applySavePayloadPhases({}, { onActivate: undefined }));
});

test('a throwing phase stops later phases without rollback or a latch', () => {
  const order = [];
  const phases = {
    onReserveUids: () => order.push('reserve'),
    onInstallWorlds: () => { order.push('install'); throw new Error('install failed'); },
    onPrune: () => order.push('prune'),
    onPortions: () => order.push('portions'),
    onActivate: () => order.push('activate'),
    onRestoreCarried: () => order.push('carried'),
    onRestoreFood: () => order.push('food'),
    onRestoreSky: () => order.push('sky'),
    onRestoreLauncher: () => order.push('launcher'),
    onFinish: () => order.push('finish'),
  };
  assert.throws(() => applySavePayloadPhases({}, phases), /install failed/);
  assert.deepEqual(order, ['reserve', 'install']);

  // The failure neither rolled back the completed phase nor latched the facade:
  // a later call runs every supplied phase again.
  order.length = 0;
  phases.onInstallWorlds = () => order.push('install');
  assert.doesNotThrow(() => applySavePayloadPhases({}, phases));
  assert.deepEqual(order, [
    'reserve', 'install', 'prune', 'portions', 'activate', 'carried', 'food',
    'sky', 'launcher', 'finish',
  ]);
});

test('apply draws no RNG', () => {
  const probe = withCaptureProbe(() => applySavePayloadPhases({}, {
    onReserveUids: () => {},
    onInstallWorlds: () => {},
    onPrune: () => {},
    onPortions: () => {},
    onActivate: () => {},
    onRestoreCarried: () => {},
    onRestoreFood: () => {},
    onRestoreSky: () => {},
    onRestoreLauncher: () => {},
    onFinish: () => 'done',
  }));
  assert.equal(probe.value, 'done');
  assert.equal(probe.draws(), 0);
});

test('validation stays the app pre-phase step, outside the phase facade', () => {
  let phaseCalls = 0;
  const runAppApply = raw => {
    const payload = normalizeSave(raw);
    return applySavePayloadPhases(payload, {
      onReserveUids: () => { phaseCalls++; },
      onFinish: () => ({ ok: true }),
    });
  };
  assert.throws(() => runAppApply({ version: 999 }), /Invalid save/);
  assert.equal(phaseCalls, 0);
});
