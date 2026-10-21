import test from 'node:test';
import assert from 'node:assert/strict';
import { createBehavior } from '../src/behaviors/index.js';
import { createBehaviorConfig } from '../src/behaviors/config.js';
import { createWorld } from '../scripts/behavior-parity.mjs';
import { normalizeHistory, HISTORY_KINDS } from '../src/family.js';
import { snapshotActor } from '../src/actorrecord.js';

function actor(uid, home, extra = {}) {
  return {
    uid, active: true, kind: 'bear', species: 'bear', name: `actor-${uid}`,
    stage: 'adult', age: 700, scale: 1, sex: uid % 2 ? 'F' : 'M',
    cx: 0, cz: 0, cy: 1, hunger: .2, thirst: .2, energy: 1, health: 100,
    social: .5, affection: .5, bold: .5, bonds: {}, skills: {}, playdates: {},
    history: [], parentUids: [], fatherUid: 0, home, grabs: 0, inPond: false,
    sleeping: false, inside: false, bedtime: 20, wakeTime: 6,
    ...extra,
  };
}

function adapter() {
  return {
    sleeps: false,
    onStop: () => {}, onSleep: () => {}, onWake: () => {},
    sleepDone: () => true, preTick: () => {}, preNeeds: () => false,
    hungerOpportunity: () => false, idleOpportunity: () => false,
    tickState: () => false,
  };
}

function setup(uidA, uidB) {
  const world = createWorld();
  const home = world.homes[0].name;
  const a = actor(uidA, home);
  const b = actor(uidB, home);
  const engine = createBehavior({
    engine: 'modules',
    config: createBehaviorConfig(),
    field: world,
    getActors: () => [a, b],
    getHours: () => 12,
    getDay: () => 1,
    getPopulationCap: () => 40,
    rng: () => .5,
  });
  engine.registerAdapter('softbody', adapter());
  engine.attach(a);
  engine.attach(b);
  return { engine, a, b };
}

function tick(engine, actor, seconds = 1) {
  for (let elapsed = 0; elapsed < seconds; elapsed += .2) {
    engine.tick(actor, .2, { ready: true });
  }
}

test('new interaction history kinds use the existing bounded actor shape', () => {
  const history = normalizeHistory([
    { kind: 'social', uid: 2, day: 1, hour: 8 },
    { kind: 'hosted', uid: 3, day: 1, hour: 9 },
    { kind: 'visit', uid: 3, day: 1, hour: 10 },
    { kind: 'decline', uid: 4, day: 1, hour: 11 },
    { kind: 'declined', uid: 4, day: 1, hour: 12 },
    { kind: 'conflict', uid: 5, day: 1, hour: 13 },
  ]);
  assert.deepEqual(history.map(event => event.kind),
    ['social', 'hosted', 'visit', 'decline', 'declined', 'conflict']);
  for (const event of history) assert.equal(HISTORY_KINDS.includes(event.kind), true);
  const saved = snapshotActor(actor(10, 'Home 1', { history }));
  assert.equal(saved.actorVersion, 2);
  assert.deepEqual(saved.history.map(event => event.kind), history.map(event => event.kind));
});

test('a completed social pair records one event for each participant', () => {
  const { engine, a, b } = setup(10, 11);
  assert.equal(engine.forceSocial(a, b).ok, true);
  tick(engine, a, 6);
  assert.deepEqual(a.history.filter(e => e.kind === 'social').map(e => e.uid), [11]);
  assert.deepEqual(b.history.filter(e => e.kind === 'social').map(e => e.uid), [10]);
});

test('a declined invitation records the two perspectives', () => {
  const { engine, a, b } = setup(10, 11);
  engine.forceSocial(a, b, false);
  assert.deepEqual(a.history.filter(e => e.kind === 'decline').map(e => e.uid), [11]);
  assert.deepEqual(b.history.filter(e => e.kind === 'declined').map(e => e.uid), [10]);
});

test('a completed food conflict records once per participant', () => {
  const { engine, a, b } = setup(10, 11);
  assert.equal(engine.forceConflict(a, b).ok, true);
  tick(engine, a, 3);
  assert.deepEqual(a.history.filter(e => e.kind === 'conflict').map(e => e.uid), [11]);
  assert.deepEqual(b.history.filter(e => e.kind === 'conflict').map(e => e.uid), [10]);
});

test('an interrupted visit is not recorded as a completed visit', () => {
  const { engine, a, b } = setup(10, 11);
  assert.equal(engine.forceVisit(a, b).ok, true);
  a.ai.visitT = 12.9;
  engine.tick(a, .2, { ready: true });
  assert.equal(a.history.some(e => e.kind === 'hosted' || e.kind === 'visit'), false);
  assert.equal(b.history.some(e => e.kind === 'hosted' || e.kind === 'visit'), false);
});

test('a visit is recorded only when the hangout completes', () => {
  const { engine, a, b } = setup(10, 11);
  assert.equal(engine.forceVisit(a, b).ok, true);
  assert.equal(a.history.some(e => e.kind === 'hosted'), false);
  assert.equal(b.history.some(e => e.kind === 'visit'), false);
  a.ai.visitPhase = 'hangout';
  b.ai.visitPhase = 'hangout';
  a.ai.visitT = .1;
  b.ai.visitT = .1;
  engine.tick(a, .2, { ready: true });
  assert.deepEqual(a.history.filter(e => e.kind === 'hosted').map(e => e.uid), [11]);
  assert.deepEqual(b.history.filter(e => e.kind === 'visit').map(e => e.uid), [10]);
});
