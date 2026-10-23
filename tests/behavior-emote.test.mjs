import test from 'node:test';
import assert from 'node:assert/strict';
import { createBehaviorModules } from '../src/behaviors/engine.js';

function makePair({ emitEmote = null, fieldEmote = null } = {}) {
  let draws = 0;
  const actors = [1, 2].map(uid => ({
    uid, active: true, kind: 'bear', species: 'bear', stage: 'adult', age: 500,
    cx: uid, cz: 0, cy: 1, hunger: .2, thirst: .2, energy: 1, health: 100,
    social: .3, affection: .25, bold: .5, home: '', parentUids: [],
    sex: uid === 1 ? 'F' : 'M', bonds: {}, skills: {}, playdates: {}, history: [],
    grabs: 0, inPond: false, sleeping: false, mateCooldown: 0,
  }));
  const field = {
    homes: [],
    nav: {
      nearestWalkable: (x, z) => ({ x, z }),
      findPath: (x, z, tx, tz) => [{ x: tx, z: tz }],
    },
    pond: { contains: () => false },
    food: { allRipe: () => [] },
    ...(fieldEmote ? { emote: fieldEmote } : {}),
  };
  const engine = createBehaviorModules({
    field,
    emitEmote,
    getActors: () => actors,
    getHours: () => 12,
    getDay: () => 0,
    getPopulationCap: () => 40,
    getAdapter: () => ({ onStop: () => {} }),
    rng: () => { draws++; return 0; },
  });
  actors.forEach(actor => engine.attach(actor));
  const baseline = draws;
  return { engine, actors, draws: () => draws - baseline };
}

test('the injected host callback receives ordered emotes instead of the field renderer', () => {
  const hostCalls = [];
  const fieldCalls = [];
  const { engine, actors, draws } = makePair({
    emitEmote: (...args) => hostCalls.push(args),
    fieldEmote: (...args) => fieldCalls.push(args),
  });
  actors[0].cx = 4;
  actors[0].cy = 2.5;
  actors[0].cz = -3;
  actors[1].cx = 5;
  actors[1].cz = -4;

  assert.equal(engine.forceSocial(actors[0], actors[1], false).ok, true);
  assert.deepEqual(hostCalls, [
    [4, 3.58, -3, 'no'],
    [5, 2.08, -4, 'no'],
  ]);
  assert.deepEqual(fieldCalls, []);
  assert.equal(draws(), 0);
});

test('omitting the callback keeps the existing field emote fallback', () => {
  const fieldCalls = [];
  const { engine, actors, draws } = makePair({
    fieldEmote: (...args) => fieldCalls.push(args),
  });

  assert.equal(engine.forceSocial(actors[0], actors[1], false).ok, true);
  assert.deepEqual(fieldCalls, [
    [1, 2.08, 0, 'no'],
    [2, 2.08, 0, 'no'],
  ]);
  assert.equal(draws(), 0);
});

test('the host callback works without a field emote and preserves nonfinite-height fallback', () => {
  const hostCalls = [];
  const { engine, actors } = makePair({
    emitEmote: (...args) => hostCalls.push(args),
  });
  actors[0].cy = NaN;

  assert.equal(engine.forceSocial(actors[0], actors[1], false).ok, true);
  assert.deepEqual(hostCalls, [
    [1, 1.08, 0, 'no'],
    [2, 2.08, 0, 'no'],
  ]);
});

test('the emit helper keeps its default height, no-actor no-op and undefined return', () => {
  const hostCalls = [];
  const { engine, actors } = makePair({
    emitEmote: (...args) => hostCalls.push(args),
  });

  assert.equal(engine.api.emit(actors[0], 'heart'), undefined);
  assert.equal(engine.api.emit(null, 'heart', 1.5), undefined);
  assert.deepEqual(hostCalls, [[1, 2, 0, 'heart']]);
});

test('callback and field fallback preserve the same enabled social trace and draw count', () => {
  function run(kind) {
    const calls = [];
    const route = kind === 'callback'
      ? { emitEmote: (...args) => calls.push(args) }
      : { fieldEmote: (...args) => calls.push(args) };
    const { engine, actors, draws } = makePair(route);
    const [a, b] = actors;
    const started = engine.forceSocial(a, b, true);
    for (let n = 0; n < 80; n++) {
      engine.tick(a, .2, { ready: true });
      if (a.ai.state === 'wander') break;
      engine.tick(b, .2, { ready: true });
    }
    return {
      calls,
      draws: draws(),
      started,
      trace: [a.ai.state, b.ai.state, a.bonds['2'], b.bonds['1']],
    };
  }

  const callback = run('callback');
  const fallback = run('field');
  assert.deepEqual(callback.calls, fallback.calls);
  assert.equal(callback.draws, fallback.draws);
  assert.deepEqual(callback.trace, fallback.trace);
  assert.equal(callback.calls.length > 0, true);
});
