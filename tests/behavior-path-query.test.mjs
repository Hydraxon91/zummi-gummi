import test from 'node:test';
import assert from 'node:assert/strict';
import { createBehaviorModules } from '../src/behaviors/engine.js';

function makePair({ useCallback = false } = {}) {
  let draws = 0;
  const navCalls = [];
  const nav = {
    nearestWalkable: (x, z) => ({ x, z }),
    findPath(fromX, fromZ, toX, toZ) {
      navCalls.push([fromX, fromZ, toX, toZ]);
      return [{ x: toX, z: toZ }];
    },
  };
  const field = {
    homes: [],
    nav,
    pond: { contains: () => false },
    food: { allRipe: () => [] },
  };
  const actors = [1, 2].map(uid => ({
    uid, active: true, kind: 'bear', species: 'bear', stage: 'adult', age: 500,
    cx: uid, cz: 0, cy: 1, hunger: .2, thirst: .2, energy: 1, health: 100,
    social: .3, affection: .25, bold: .5, home: '', parentUids: [],
    sex: uid === 1 ? 'F' : 'M', bonds: {}, skills: {}, playdates: {}, history: [],
    grabs: 0, inPond: false, sleeping: false, mateCooldown: 0,
  }));
  const engine = createBehaviorModules({
    field,
    ...(useCallback ? { findPath: (fromX, fromZ, toX, toZ) => nav.findPath(fromX, fromZ, toX, toZ) } : {}),
    getActors: () => actors,
    getHours: () => 12,
    getDay: () => 0,
    getPopulationCap: () => 40,
    getAdapter: () => ({ onStop: () => {} }),
    rng: () => { draws++; return 0; },
  });
  actors.forEach(actor => engine.attach(actor));
  const baseline = draws;
  return { engine, actors, navCalls, draws: () => draws - baseline };
}

test('pathTo dispatches the numeric callback without a field or rendered imports', () => {
  const calls = [];
  const path = [{ x: 3, z: 4 }];
  const engine = createBehaviorModules({
    getActors: () => [],
    findPath: (...args) => { calls.push(args); return path; },
  });
  const actor = { cx: 1.5, cz: -2.25 };

  const result = engine.api.pathTo(actor, 7, 8);
  assert.equal(result, path);
  assert.deepEqual(calls, [[1.5, -2.25, 7, 8]]);
});

test('the supplied callback takes precedence over field.nav.findPath', () => {
  let fieldCalls = 0;
  const field = {
    nav: { findPath: () => { fieldCalls++; return [{ x: 99, z: 99 }]; } },
  };
  const callbackPath = [{ x: 1, z: 2 }];
  const engine = createBehaviorModules({
    field,
    getActors: () => [],
    findPath: () => callbackPath,
  });

  assert.equal(engine.api.pathTo({ cx: 0, cz: 0 }, 1, 2), callbackPath);
  assert.equal(fieldCalls, 0);
});

test('null, empty and nonempty callback results keep identity without field fallback', () => {
  let result = null;
  let fieldCalls = 0;
  const field = {
    nav: {
      findPath: () => {
        fieldCalls++;
        throw new Error('field fallback must not run for a supplied callback');
      },
    },
  };
  const engine = createBehaviorModules({
    field,
    getActors: () => [],
    findPath: () => result,
  });
  const actor = { cx: 0, cz: 0 };

  assert.equal(engine.api.pathTo(actor, 1, 1), null);
  result = [];
  assert.equal(engine.api.pathTo(actor, 1, 1), result);
  const node = { x: 2, z: 3 };
  result = [node];
  const path = engine.api.pathTo(actor, 1, 1);
  assert.equal(path, result);
  assert.equal(path[0], node);
  assert.equal(fieldCalls, 0);
});

test('pathTo adds no RNG draws on either route', () => {
  let draws = 0;
  const rng = () => { draws++; return 0; };
  const callbackEngine = createBehaviorModules({
    getActors: () => [],
    rng,
    findPath: () => [{ x: 1, z: 1 }],
  });
  const fieldEngine = createBehaviorModules({
    getActors: () => [],
    rng,
    field: { nav: { findPath: () => [{ x: 1, z: 1 }] } },
  });
  const actor = { cx: 0, cz: 0 };

  assert.equal(callbackEngine.api.pathTo(actor, 1, 1).length, 1);
  assert.equal(fieldEngine.api.pathTo(actor, 1, 1).length, 1);
  assert.equal(draws, 0);
});

test('omitting the callback keeps the missing field/nav null fallback', () => {
  const noField = createBehaviorModules({ getActors: () => [] });
  const noNav = createBehaviorModules({ getActors: () => [], field: {} });
  const actor = { cx: 0, cz: 0 };

  assert.equal(noField.api.pathTo(actor, 1, 1), null);
  assert.equal(noNav.api.pathTo(actor, 1, 1), null);
});

test('the field fallback keeps its nav receiver', () => {
  const nav = {
    offset: 10,
    findPath(fromX, fromZ, toX, toZ) {
      assert.equal(this, nav);
      return [{ x: fromX + this.offset, z: fromZ, tx: toX, tz: toZ }];
    },
  };
  const engine = createBehaviorModules({
    getActors: () => [],
    field: { nav },
  });

  assert.deepEqual(engine.api.pathTo({ cx: 2, cz: 3 }, 4, 5), [
    { x: 12, z: 3, tx: 4, tz: 5 },
  ]);
});

test('findPath:null uses the field fallback with receiver and path identity', () => {
  const node = { x: 4, z: 5 };
  const path = [node];
  const nav = {
    marker: 'nav',
    findPath(fromX, fromZ, toX, toZ) {
      assert.equal(this, nav);
      assert.deepEqual([fromX, fromZ, toX, toZ], [1, 2, 3, 4]);
      return path;
    },
  };
  const engine = createBehaviorModules({
    getActors: () => [],
    field: { nav },
    findPath: null,
  });

  const result = engine.api.pathTo({ cx: 1, cz: 2 }, 3, 4);
  assert.equal(result, path);
  assert.equal(result[0], node);
});

test('the fallback reads the current navigator at call time', () => {
  const field = { nav: { findPath: () => ['first'] } };
  const engine = createBehaviorModules({ getActors: () => [], field });
  const actor = { cx: 0, cz: 0 };

  assert.deepEqual(engine.api.pathTo(actor, 1, 1), ['first']);
  field.nav = { findPath: () => ['second'] };
  assert.deepEqual(engine.api.pathTo(actor, 1, 1), ['second']);
});

test('a host-like delegate uses the current navigator and keeps its receiver', () => {
  const path = [{ x: 4, z: 5 }];
  const firstNav = {
    findPath: () => { throw new Error('stale navigator used'); },
  };
  const secondNav = {
    findPath(fromX, fromZ, toX, toZ) {
      assert.equal(this, secondNav);
      assert.deepEqual([fromX, fromZ, toX, toZ], [1, 2, 3, 4]);
      return path;
    },
  };
  const field = { nav: firstNav };
  const engine = createBehaviorModules({
    getActors: () => [],
    field,
    findPath: (fromX, fromZ, toX, toZ) => field.nav.findPath(fromX, fromZ, toX, toZ),
  });

  field.nav = secondNav;
  assert.equal(engine.api.pathTo({ cx: 1, cz: 2 }, 3, 4), path);
});

test('malformed non-null callbacks are rejected at construction', () => {
  for (const value of ['path', 1, false, {}, []]) {
    assert.throws(
      () => createBehaviorModules({ getActors: () => [], findPath: value }),
      TypeError,
    );
  }
  assert.doesNotThrow(() => createBehaviorModules({ getActors: () => [] }));
});

test('callback exceptions propagate unchanged', () => {
  const failure = new Error('path query failed');
  const engine = createBehaviorModules({
    getActors: () => [],
    findPath: () => { throw failure; },
  });

  assert.throws(
    () => engine.api.pathTo({ cx: 0, cz: 0 }, 1, 1),
    error => error === failure,
  );
});

test('callback and fallback keep the same fixed-RNG social trace and draw count', () => {
  function run(useCallback) {
    const { engine, actors, navCalls, draws } = makePair({ useCallback });
    const [a, b] = actors;
    a.cx = 1;
    a.cz = 0;
    b.cx = 12;
    b.cz = 0;
    const started = engine.forceSocial(a, b, true);
    const trace = [];
    for (let n = 0; n < 80; n++) {
      engine.tick(a, .2, { ready: true });
      engine.tick(b, .2, { ready: true });
      trace.push({
        states: [a.ai.state, b.ai.state],
        needs: [a.hunger, a.thirst, a.social, a.affection],
        path: a.ai.path ? a.ai.path.map(p => [p.x, p.z]) : null,
        partner: b.ai.state,
      });
    }
    return { started, trace, draws: draws(), navCalls: navCalls.length };
  }

  const callback = run(true);
  const fallback = run(false);
  assert.deepEqual(callback.started, fallback.started);
  assert.deepEqual(callback.trace, fallback.trace);
  assert.equal(callback.draws, fallback.draws);
  assert.equal(callback.navCalls, fallback.navCalls);
  assert.equal(callback.navCalls > 0, true);
});
