import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionGate, SESSION_OPERATION_KINDS } from '../src/sessiongate.js';

test('one operation acquires and releases the session', () => {
  const gate = createSessionGate();
  assert.equal(gate.current(), null);
  assert.equal(gate.isBusy(), false);
  assert.equal(gate.begin('save'), true);
  assert.equal(gate.current(), 'save');
  assert.equal(gate.isBusy(), true);
  assert.equal(gate.end('save'), true);
  assert.equal(gate.current(), null);
  assert.equal(gate.isBusy(), false);
});

test('a second operation is rejected while one is active', () => {
  const gate = createSessionGate();
  assert.equal(gate.begin('save'), true);
  for (const kind of SESSION_OPERATION_KINDS) {
    if (kind === 'save') continue;
    assert.equal(gate.begin(kind), false, `${kind} must not acquire`);
  }
  assert.equal(gate.begin('save'), false);
  assert.equal(gate.current(), 'save');
  assert.equal(gate.end('save'), true);
});

test('end only clears the matching active kind', () => {
  const gate = createSessionGate();
  assert.equal(gate.end('save'), false);
  assert.equal(gate.begin('load'), true);
  assert.equal(gate.end('import'), false);
  assert.equal(gate.end('save'), false);
  assert.equal(gate.current(), 'load');
  assert.equal(gate.end('load'), true);
  assert.equal(gate.end('load'), false);
  assert.equal(gate.current(), null);
});

test('onChange reports exactly one transition per acquire/release', () => {
  const seen = [];
  const gate = createSessionGate({ onChange: current => seen.push(current) });
  assert.deepEqual(seen, []);
  assert.equal(gate.begin('map-switch'), true);
  assert.deepEqual(seen, ['map-switch']);
  assert.equal(gate.begin('save'), false);
  assert.equal(gate.end('save'), false);
  assert.deepEqual(seen, ['map-switch']);
  assert.equal(gate.end('map-switch'), true);
  assert.deepEqual(seen, ['map-switch', null]);
});

test('invalid kinds are rejected without a transition', () => {
  const seen = [];
  const gate = createSessionGate({ onChange: current => seen.push(current) });
  for (const kind of ['', 'Save', 'continue', null, undefined, 1]) {
    assert.equal(gate.begin(kind), false, `${String(kind)} must not acquire`);
  }
  assert.deepEqual(seen, []);
  assert.equal(gate.current(), null);

  assert.equal(gate.begin('save'), true);
  assert.equal(gate.begin('bogus'), false);
  assert.equal(gate.current(), 'save');
});

test('the gate draws no RNG', () => {
  const original = Math.random;
  let draws = 0;
  Math.random = () => { draws++; return 0.5; };
  try {
    const gate = createSessionGate();
    gate.begin('save');
    gate.begin('load');
    gate.end('load');
    gate.end('save');
    gate.begin('autosave');
    gate.end('autosave');
  } finally {
    Math.random = original;
  }
  assert.equal(draws, 0);
});

test('rejected work is not queued or started after release', () => {
  let starts = 0;
  const gate = createSessionGate();
  const tryStart = kind => {
    if (!gate.begin(kind)) return false;
    starts++;
    return true;
  };
  assert.equal(tryStart('load'), true);
  assert.equal(tryStart('save'), false);
  assert.equal(tryStart('new-game'), false);
  gate.end('load');
  assert.equal(starts, 1);
  assert.equal(gate.current(), null);
  assert.equal(tryStart('save'), true);
});

test('the declared operation kinds are frozen and complete', () => {
  assert.equal(Object.isFrozen(SESSION_OPERATION_KINDS), true);
  assert.deepEqual([...SESSION_OPERATION_KINDS], [
    'save', 'export', 'load', 'import', 'map-switch', 'new-game', 'autosave',
  ]);
});
