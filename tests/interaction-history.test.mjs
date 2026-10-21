import test from 'node:test';
import assert from 'node:assert/strict';
import { createBehavior } from '../src/behaviors/index.js';
import { createBehaviorConfig } from '../src/behaviors/config.js';
import { createWorld } from '../scripts/behavior-parity.mjs';
import {
  normalizeHistory, pushHistory, HISTORY_KINDS, HISTORY_LIMIT,
  INTERACTION_HISTORY_KINDS,
} from '../src/family.js';
import { snapshotActor } from '../src/actorrecord.js';
import { moodFor } from '../src/behaviors/mood.js';

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

function setup(uidA, uidB, { interactionHistory = true } = {}) {
  const world = createWorld();
  const home = world.homes[0].name;
  const a = actor(uidA, home);
  const b = actor(uidB, home);
  const engine = createBehavior({
    engine: 'modules',
    config: createBehaviorConfig({ features: { interactionHistory } }),
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

test('interaction history off writes nothing to either actor', () => {
  const { engine, a, b } = setup(10, 11, { interactionHistory: false });
  engine.forceSocial(a, b);
  tick(engine, a, 6);
  engine.forceConflict(a, b);
  tick(engine, a, 3);
  assert.deepEqual(a.history, []);
  assert.deepEqual(b.history, []);
});

test('interaction history never displaces behavior history', () => {
  const a = actor(10, 'Home 1');
  const meals = Array.from({ length: 15 }, (_, index) =>
    ({ kind: 'meal', uid: 20 + index, day: 1, hour: 8 }));
  a.history = [
    { kind: 'lesson', uid: 2, day: 1, hour: 7 },
    ...meals,
  ];
  const before = JSON.stringify(a.history);
  assert.equal(a.history.length, HISTORY_LIMIT);
  pushHistory(a, { kind: 'social', uid: 3, day: 1, hour: 9 });
  assert.equal(a.history.length, HISTORY_LIMIT);
  assert.equal(JSON.stringify(a.history), before, 'a full behavior buffer is unchanged');
  assert.equal(a.history.some(event => event.kind === 'social'), false);

  a.history[5] = { kind: 'social', uid: 2, day: 1, hour: 8 };
  pushHistory(a, { kind: 'meal', uid: 30, day: 1, hour: 9 });
  assert.equal(a.history.some(event => event.kind === 'social'), false);
  assert.equal(a.history.some(event => event.kind === 'meal' && event.uid === 30), true);
  assert.equal(a.history.some(event => event.kind === 'lesson'), true);
});

test('logging leaves the non-interaction history and mood identical', () => {
  const base = Array.from({ length: HISTORY_LIMIT }, (_, index) => ({
    kind: index === 0 ? 'lesson' : 'meal',
    uid: 20 + index,
    day: 1,
    hour: 8,
  }));
  const logged = actor(10, 'Home 1', { history: structuredClone(base) });
  const plain = actor(10, 'Home 1', { history: structuredClone(base) });
  const events = [
    { kind: 'social', uid: 2, day: 1, hour: 9 },
    { kind: 'meal', uid: 30, day: 1, hour: 10 },
    { kind: 'social', uid: 3, day: 1, hour: 11 },
    { kind: 'playdate', uid: 31, day: 1, hour: 12 },
    { kind: 'social', uid: 4, day: 2, hour: 9 },
    { kind: 'lesson', uid: 32, day: 2, hour: 10 },
  ];
  for (const event of events) {
    if (!INTERACTION_HISTORY_KINDS.has(event.kind)) pushHistory(plain, event);
    pushHistory(logged, event);
    assert.deepEqual(
      logged.history.filter(item => !INTERACTION_HISTORY_KINDS.has(item.kind)),
      plain.history,
    );
  }
  assert.equal(moodFor(logged, { day: 3, hours: 12 }), moodFor(plain, { day: 3, hours: 12 }));
});

test('a completed social pair records one event with a bond delta for each participant', () => {
  const { engine, a, b } = setup(10, 11);
  assert.equal(engine.forceSocial(a, b).ok, true);
  tick(engine, a, 6);
  const eventA = a.history.find(e => e.kind === 'social');
  const eventB = b.history.find(e => e.kind === 'social');
  assert.equal(eventA.uid, 11);
  assert.equal(eventB.uid, 10);
  assert.ok(eventA.bondAfter > eventA.bondBefore);
  assert.ok(eventB.bondAfter > eventB.bondBefore);
});

test('asymmetric bonds keep per-actor deltas', () => {
  const { engine, a, b } = setup(10, 11);
  a.bonds[11] = .2;
  b.bonds[10] = .6;
  engine.forceSocial(a, b);
  tick(engine, a, 6);
  const eventA = a.history.find(e => e.kind === 'social');
  const eventB = b.history.find(e => e.kind === 'social');
  assert.equal(eventA.bondBefore, .2);
  assert.equal(eventB.bondBefore, .6);
  assert.equal(eventA.bondAfter, eventB.bondAfter);
  assert.ok(eventA.bondAfter > eventA.bondBefore);
});

test('a declined invitation records the two perspectives', () => {
  const { engine, a, b } = setup(10, 11);
  engine.forceSocial(a, b, false);
  assert.deepEqual(a.history.filter(e => e.kind === 'decline').map(e => e.uid), [11]);
  assert.deepEqual(b.history.filter(e => e.kind === 'declined').map(e => e.uid), [10]);
  assert.equal(a.history.find(e => e.kind === 'decline').bondBefore, undefined);
});

test('a completed food conflict records once per participant', () => {
  const { engine, a, b } = setup(10, 11);
  a.bonds[11] = .5;
  b.bonds[10] = .5;
  assert.equal(engine.forceConflict(a, b).ok, true);
  tick(engine, a, 3);
  const eventA = a.history.find(e => e.kind === 'conflict');
  const eventB = b.history.find(e => e.kind === 'conflict');
  assert.equal(eventA.uid, 11);
  assert.equal(eventB.uid, 10);
  assert.ok(eventA.bondAfter < eventA.bondBefore);
  assert.ok(eventB.bondAfter < eventB.bondBefore);
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
  const hosted = a.history.find(e => e.kind === 'hosted');
  const visit = b.history.find(e => e.kind === 'visit');
  assert.equal(hosted.uid, 11);
  assert.equal(visit.uid, 10);
  assert.ok(hosted.bondAfter > hosted.bondBefore);
  assert.ok(visit.bondAfter > visit.bondBefore);
});
