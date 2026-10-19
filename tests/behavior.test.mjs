import test from 'node:test';
import assert from 'node:assert/strict';
import { createBehavior } from '../src/behavior.js';
import { createActorView } from '../src/npc.js';
import {
  registerInteraction, interactionFor, startTask, tickTask, cancelTask,
  pairAvailable, beginPair, endPair, breakPair,
} from '../src/interactions.js';
import { homeRoutineOffset } from '../src/family.js';

function fakeField() {
  const source = {
    id: 'food-1', kind: 'flower', label: 'flower',
    x: 2, z: 0, approachX: 2, approachZ: 0,
    ripe: true, satiation: .3, claim: null,
  };
  const hive = {
    id: 'hive-1', kind: 'hive', label: 'beehive',
    x: 3, z: 1, approachX: 3, approachZ: 1,
    ripe: true, satiation: .55, claim: null,
  };
  return {
    homes: [{ name: 'Home 1', x: 0, z: 0, door: { x: 1, z: 0 } }],
    nav: {
      nearestWalkable: (x, z) => ({ x, z }),
      findPath: (x, z, tx, tz) => [{ x: tx, z: tz }],
    },
    pond: { contains: () => false },
    waterSpots: [{ x: 4, z: 0, waterX: 4, waterZ: 0 }],
    food: {
      sources: [source, hive],
      allRipe: () => [source, hive],
      nearestRipe: (x, z, opts = {}) => {
        const pool = opts.kinds ? [source, hive].filter(item => opts.kinds.includes(item.kind)) : [source, hive];
        return pool.find(item => !(opts.exclude && opts.exclude.has(item.id))) || null;
      },
      claim: (s, a) => { s.claim = a; return true; },
      release: (s, a) => { if (!a || s.claim === a) s.claim = null; },
      consume: () => true,
      stats: () => ({ ripe: 2 }),
    },
    emote: () => {},
    splash: () => {},
    sting: () => {},
  };
}

function fakeAdapter() {
  return {
    sleeps: false,
    onStop: () => {},
    onSleep: () => {},
    onWake: () => {},
    sleepDone: () => true,
    preTick: () => {},
    preNeeds: () => false,
    hungerOpportunity: () => false,
    idleOpportunity: () => false,
    tickState: () => false,
  };
}

function actor(uid, extra = {}) {
  return {
    uid, active: true, kind: 'bear', species: 'bear',
    cx: 0, cz: 0, cy: 1,
    hunger: .3, thirst: .3, energy: 1, health: 100,
    social: .3, affection: .25, bold: .5,
    home: 'Home 1', parentUids: [], sex: uid % 2 ? 'F' : 'M',
    bonds: {}, skills: {}, playdates: {}, history: [],
    grabs: 0, inPond: false, sleeping: false,
    ...extra,
  };
}

function setup({ hours = 12, day = 1, rng = () => 0 } = {}) {
  const field = fakeField();
  const adapter = fakeAdapter();
  const actors = [];
  const engine = createBehavior({
    field,
    getActors: () => actors,
    getHours: () => hours,
    getDay: () => day,
    getPopulationCap: () => 40,
    getAdapter: () => adapter,
    rng,
  });
  return { field, adapter, actors, engine, setHours: (h) => { hours = h; } };
}

test('attach builds the shared state shape and needs tick', () => {
  const { actors, engine, setHours } = setup();
  const a = actor(1);
  actors.push(a);
  const ai = engine.attach(a);
  assert.equal(ai.state, 'wander');
  assert.equal(a.home, 'Home 1');
  const before = a.hunger;
  setHours(12);
  engine.tick(a, 10, { ready: true });
  assert.ok(a.hunger > before);
  assert.ok(a.thirst > .3);
});

test('wander picks a destination and food/water needs pre-empt it', () => {
  const { actors, engine } = setup();
  const a = actor(1);
  actors.push(a);
  engine.tick(a, .01, { ready: true });
  assert.equal(a.ai.state, 'wander');
  assert.ok(a.ai.target, 'a wander target is picked');

  a.hunger = .8;
  a.ai.target = null;
  a.ai.moving = false;
  a.ai.idleT = 0;
  a.ai.taskCooldown = 0;
  a.ai.nextThink = 0;
  engine.tick(a, .01, { ready: true });
  assert.equal(a.ai.state, 'seekFood');
  assert.equal(a.ai.source.id, 'food-1');

  a.ai.state = 'wander';
  a.thirst = .8;
  a.hunger = .3;
  a.ai.source = null;
  a.ai.target = null;
  a.ai.moving = false;
  a.ai.idleT = 0;
  a.ai.taskCooldown = 0;
  a.ai.nextThink = 0;
  engine.tick(a, .01, { ready: true });
  assert.equal(a.ai.state, 'seekWater');
});

test('sleep follows the night schedule and wakes when the adapter is done', () => {
  const { actors, engine, adapter, setHours } = setup();
  const a = actor(1);
  actors.push(a);
  engine.attach(a);
  setHours(22);
  adapter.sleepDone = () => false;
  engine.tick(a, .01, { ready: true });
  assert.equal(a.ai.state, 'seekHome');
  engine.tick(a, .3, { ready: true });
  assert.equal(a.ai.state, 'sleep');
  assert.equal(a.sleeping, true);
  adapter.sleepDone = () => true;
  engine.tick(a, .01, { ready: true });
  assert.equal(a.ai.state, 'wander');
  assert.equal(a.sleeping, false);
});

test('invite and social use the shared pair protocol and raise the bond', () => {
  const { actors, engine } = setup({ rng: () => 1 });
  const a = actor(1, { social: .8 });
  const b = actor(2, { social: .8, cx: .5 });
  actors.push(a, b);
  engine.attach(a); engine.attach(b);
  engine.forceInvite(a, b, true);
  assert.equal(a.ai.state, 'invite');
  engine.tick(a, .8, { ready: true });
  assert.equal(a.ai.state, 'social');
  assert.equal(b.ai.state, 'social');
  engine.tick(a, 5, { ready: true });
  assert.notEqual(a.ai.state, 'social');
  assert.ok(Number(a.bonds['2'] || 0) > 0);
});

test('mate produces a pregnancy shared by both representations', () => {
  const { actors, engine } = setup({ rng: () => 1 });
  const a = actor(1, { sex: 'F' });
  const b = actor(2, { sex: 'M', cx: .5 });
  a.skills = { forage: .5 };
  b.skills = { forage: .2 };
  actors.push(a, b);
  engine.attach(a); engine.attach(b);
  engine.forceMate(a, b);
  assert.equal(a.ai.state, 'mate');
  engine.tick(a, 3.1, { ready: true });
  assert.equal(a.pregnant, true);
  assert.equal(a.fatherUid, 2);
  assert.ok(a.mateCooldown > 0);
});

test('playdate sets a paired task, raises the bond and schedules the next day', () => {
  const { actors, engine } = setup({ rng: () => 1 });
  const a = actor(1, { parentUids: [2] });
  const b = actor(2, { sex: 'F', cx: .5 });
  actors.push(a, b);
  engine.attach(a); engine.attach(b);
  assert.equal(engine.forcePlaydate(a, b, 'parent').ok, true);
  assert.equal(a.ai.state, 'familyTask');
  assert.equal(b.ai.state, 'familyTask');
  engine.tick(a, 10.1, { ready: true });
  engine.tick(b, 10.1, { ready: true });
  assert.ok(Number(a.bonds['2'] || 0) > 0);
  assert.ok(a.history.some(event => event.kind === 'playdate'));
  assert.equal(a.playdates['2'].day, 2);
});

test('grab cancels a shared pair and leaves both actors idle', () => {
  const { actors, engine } = setup({ rng: () => 1 });
  const a = actor(1, { social: .8 });
  const b = actor(2, { social: .8, cx: .5 });
  actors.push(a, b);
  engine.attach(a); engine.attach(b);
  engine.forceSocial(a, b, true);
  assert.equal(a.ai.state, 'social');
  engine.onGrab(a);
  assert.equal(a.ai.state, 'wander');
  assert.equal(b.ai.state, 'wander');
  assert.equal(a.ai.partner, null);
  assert.equal(b.ai.partner, null);
});

test('hive raids are profile-gated and resolve sting or snack', () => {
  const { actors, engine } = setup({ rng: () => 1 });
  const a = actor(1, { hunger: .97, health: 100, bold: .5 });
  actors.push(a);
  engine.attach(a);
  a.ai.nextThink = 0;
  engine.tick(a, .01, { ready: true });
  assert.equal(a.ai.state, 'seekHive');
  assert.equal(a.ai.source.id, 'hive-1');

  a.cx = 3; a.cz = 1; a.ai.nextThink = 0;
  engine.tick(a, .01, { ready: true });
  assert.equal(a.ai.state, 'raidHive');
  const before = a.hunger;
  engine.tick(a, 2, { ready: true });
  assert.equal(a.ai.state, 'wander');
  assert.ok(a.hunger < before);
});

test('conflict resolves a claimed food source without leaving both paired', () => {
  const { actors, engine, field } = setup({ rng: () => 1 });
  const a = actor(1, { hunger: .8, scale: 1.0 });
  const b = actor(2, { hunger: .8, scale: .9, cx: .5 });
  actors.push(a, b);
  engine.attach(a); engine.attach(b);
  const source = field.food.sources.find(item => item.id === 'food-1');
  source.claim = b;
  const result = engine.forceConflict(a, b, source);
  assert.equal(result.ok, true);
  assert.equal(a.ai.state, 'conflict');
  assert.equal(b.ai.state, 'conflict');
  engine.tick(a, 1, { ready: true });
  assert.notEqual(a.ai.state, 'conflict');
  assert.notEqual(b.ai.state, 'conflict');
  assert.equal(source.claim, a);
  assert.ok(b.ai.shove || b.ai.conflictCooldown > 0);
});

test('household routine starts a family meal once per window', () => {
  const offset = homeRoutineOffset('Home 1');
  const { actors, engine, setHours } = setup({ rng: () => 1 });
  setHours(12 + offset + .1);
  const a = actor(1, { hunger: .5 });
  const b = actor(2, { hunger: .5, cx: .6 });
  actors.push(a, b);
  engine.attach(a); engine.attach(b);
  a.ai.nextThink = 0;
  b.ai.nextThink = 0;
  engine.tick(a, .01, { ready: true });
  assert.equal(a.ai.state, 'familyTask');
  assert.equal(a.ai.familyTask.id, 'familyMeal');
  assert.equal(a.ai.familyTask.data.routine, 'lunch');
  // Move the eater to the anchor and finish the meal next to their housemate.
  a.cx = 2; a.cz = 0;
  b.cx = 2.2; b.cz = 0;
  engine.tick(a, 7, { ready: true });
  assert.notEqual(a.ai.state, 'familyTask');
  assert.ok(a.hunger < .5);
  assert.ok(a.history.some(event => event.kind === 'meal'));
  assert.ok(Number(a.bonds['2'] || 0) > 0);

  // The same window cannot trigger a second meal.
  a.ai.state = 'wander';
  a.ai.nextThink = 0;
  a.ai.taskCooldown = 0;
  a.hunger = .5;
  engine.tick(a, .01, { ready: true });
  assert.notEqual(a.ai.state, 'familyTask');
});

test('parent teaching raises the child skill once per day', () => {
  const { actors, engine } = setup({ rng: () => 1 });
  const parent = actor(1, { stage: 'adult', skills: { forage: .6, courage: .2, social: .1 } });
  const child = actor(2, { stage: 'teen', parentUids: [1], cx: .8 });
  actors.push(parent, child);
  engine.attach(parent); engine.attach(child);
  parent.ai.nextThink = 0;
  engine.tick(parent, .01, { ready: true });
  assert.equal(parent.ai.state, 'familyTask');
  assert.equal(parent.ai.familyTask.id, 'familyLesson');
  assert.equal(parent.ai.familyTask.role, 'teacher');
  engine.tick(parent, 6, { ready: true });
  assert.notEqual(parent.ai.state, 'familyTask');
  assert.ok(child.skills.forage >= .12);
  assert.ok(child.history.some(event => event.kind === 'taught'));
  assert.ok(parent.history.some(event => event.kind === 'lesson'));

  parent.ai.state = 'wander';
  parent.ai.nextThink = 0;
  parent.ai.taskCooldown = 0;
  engine.tick(parent, .01, { ready: true });
  assert.notEqual(parent.ai.state, 'familyTask');
});

test('interaction primitives create and clear shared pair/task state', () => {
  registerInteraction({ id: 'testTask', mode: 'pair', duration: 2, arriveDist: 1 });
  const def = interactionFor('testTask');
  assert.equal(def.duration, 2);

  const a = actor(1);
  const b = actor(2, { cx: .5 });
  a.ai = { state: 'wander', partner: null };
  b.ai = { state: 'wander', partner: null };
  assert.equal(pairAvailable(a, b, { states: ['wander'] }), true);
  b.inside = true;
  assert.equal(pairAvailable(a, b, { states: ['wander'] }), false);
  b.inside = false;

  beginPair(a, b, 'social', { durationField: 'socialT', duration: 3 });
  assert.equal(a.ai.partner, b);
  assert.equal(b.ai.partner, a);
  assert.equal(a.ai.socialT, 3);
  endPair(a, { stop: () => {} });
  assert.equal(a.ai.partner, null);
  assert.equal(b.ai.state, 'wander');

  startTask(a, 'testTask', { partner: b, anchor: { x: 0, z: 0 } });
  assert.equal(a.ai.state, 'familyTask');
  assert.equal(a.ai.familyTask.phase, 'act');
  const next = tickTask(a, 2.1, { arriveDist: 1 });
  assert.equal(next.done, true);
  cancelTask(a, { stop: () => {} });
  assert.equal(a.ai.state, 'wander');

  const view = createActorView({ getSoft: () => [a], getGlass: () => [b] });
  assert.equal(view.active().length, 2);
  assert.equal(view.byUid(1), a);
});
