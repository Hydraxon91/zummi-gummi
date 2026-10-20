import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDepartureHook, departureTuple, DEPARTURE_CAUSES, STAR_REASONS,
} from '../src/departures.js';
import { createBehaviorConfig, FEATURE_DEFAULTS } from '../src/behaviors/config.js';
import { createBehavior } from '../src/behaviors/index.js';
import { createWorld, createRoster } from '../scripts/behavior-parity.mjs';
import { pruneActorRefs } from '../src/family.js';
import { snapshotActor } from '../src/actorrecord.js';

function makeActor(uid, species = 'bear', extra = {}) {
  return {
    uid,
    active: true,
    species,
    kind: species === 'glass' ? 'glass' : 'bear',
    name: `actor-${uid}`,
    sex: uid % 2 ? 'F' : 'M',
    stage: 'adult',
    age: 700,
    scale: 1,
    health: 100,
    hunger: .3,
    thirst: .3,
    energy: 1,
    social: .5,
    affection: .3,
    bonds: {},
    skills: {},
    history: [],
    playdates: {},
    parentUids: [],
    genome: { version: 1 },
    home: 'Home 1',
    cx: uid,
    cz: 0,
    ...extra,
  };
}

function fixture() {
  const leaving = makeActor(2);
  const survivor = makeActor(1, 'bear', { bonds: { 2: .7, 3: .2 } });
  const other = makeActor(3, 'bear', { bonds: { 2: .2 } });
  const actors = [survivor, leaving, other];
  const hook = createDepartureHook({
    getActors: () => actors,
    getMapId: () => 'field',
    getTime: () => ({ day: 1, hours: 12 }),
  });
  return { leaving, survivor, other, actors, hook };
}

test('departures are off by default and expose the fixed cause vocabulary', () => {
  assert.equal(FEATURE_DEFAULTS.departures, false);
  assert.deepEqual(DEPARTURE_CAUSES, ['removed', 'stars']);
  assert.deepEqual(STAR_REASONS, ['oldAge', 'starvation', 'sting']);
});

test('a departure snapshots bondOf for active survivors before teardown', () => {
  const { leaving, survivor, other, hook } = fixture();
  const rows = hook.snapshot(leaving, 'removed', { at: 42 });
  assert.equal(rows.length, 2);
  assert.equal(hook.count, 1);
  assert.equal(rows[0].departedUid, 2);
  assert.equal(rows[0].bond, .7);
  assert.equal(rows[1].bond, .2);
  assert.equal(rows[0].map, 'field');
  assert.equal(rows[0].at, 42);
  assert.equal(rows[0].reason, null);
  assert.equal(hook.forSurvivor(survivor).length, 1);
  assert.equal(hook.forSurvivor(other).length, 1);
});

test('the snapshot stays complete if the departure is followed by a save prune', () => {
  const { leaving, survivor, hook } = fixture();
  hook.snapshot(leaving, 'removed');
  const captured = hook.forSurvivor(survivor)[0];
  assert.equal(captured.bond, .7);

  pruneActorRefs(survivor, [1]);
  assert.deepEqual(survivor.bonds, {});
  assert.equal(hook.forSurvivor(survivor)[0].bond, .7,
    'runtime snapshot must retain the departure-time bond');

  const record = snapshotActor(survivor);
  assert.equal(JSON.stringify(record).includes('departure'), false);
  assert.equal(JSON.stringify(record).includes('departedUid'), false);
});

test('the hook is disabled without its flag and never records a departure', () => {
  const { leaving } = fixture();
  const hook = createDepartureHook({
    isEnabled: () => false,
    getActors: () => [],
  });
  assert.deepEqual(hook.snapshot(leaving, 'removed'), []);
  assert.equal(hook.count, 0);
  assert.deepEqual(hook.list(), []);
});

test('stars requires a valid reason; removed accepts no reason', () => {
  const { leaving, hook } = fixture();
  assert.deepEqual(hook.snapshot(leaving, 'stars'), []);
  assert.deepEqual(hook.snapshot(leaving, 'stars', { reason: 'unknown' }), []);
  assert.equal(hook.snapshot(leaving, 'stars', { reason: 'oldAge' }).length, 2);
  assert.equal(hook.snapshot(leaving, 'removed', { reason: 'starvation' }).length, 2);
  assert.equal(hook.count, 2);
});

test('departure capture is deterministic across repeated seeded runs', () => {
  const results = [];
  for (let repeat = 0; repeat < 3; repeat++) {
    const { survivor, leaving, other, hook } = fixture();
    survivor.bonds = { 2: .61, 3: .24 };
    other.bonds = { 2: .08 };
    const rows = hook.snapshot(leaving, 'stars', {
      reason: 'starvation',
      at: 100,
    });
    results.push(rows.map(row => departureTuple(row)));
  }
  assert.deepEqual(results[0], results[1]);
  assert.deepEqual(results[1], results[2]);
});

test('the departure hook consumes no RNG', () => {
  const { leaving, hook } = fixture();
  const original = Math.random;
  Math.random = () => { throw new Error('departure hook consumed RNG'); };
  try {
    assert.equal(hook.snapshot(leaving, 'removed').length, 2);
  } finally {
    Math.random = original;
  }
});

test('turning departures off or on does not change the engine state or RNG', () => {
  function run(on) {
    const world = createWorld();
    const roster = createRoster('bear');
    let draws = 0;
    const config = createBehaviorConfig({ features: { departures: on } });
    const engine = createBehavior({
      engine: 'modules', config, field: world, getActors: () => roster,
      getHours: () => 12, getDay: () => 1, getPopulationCap: () => 40,
      rng: () => { draws++; return .5; },
    });
    const warn = console.warn;
    console.warn = () => {};
    try {
      for (const actor of roster) engine.attach(actor);
      for (let tick = 0; tick < 80; tick++) {
        for (const actor of roster) engine.tick(actor, 1 / 20);
      }
    } finally {
      console.warn = warn;
    }
    return {
      draws,
      state: JSON.stringify(roster.map(actor => [
        actor.uid, actor.ai?.state, actor.cx, actor.cz, actor.health,
      ])),
    };
  }
  const off = run(false);
  const on = run(true);
  assert.equal(on.draws, off.draws);
  assert.equal(on.state, off.state);
});
