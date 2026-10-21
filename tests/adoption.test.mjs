import test from 'node:test';
import assert from 'node:assert/strict';
import { createBehavior } from '../src/behaviors/index.js';
import { createBehaviorConfig } from '../src/behaviors/config.js';
import { createWorld, mulberry32 } from '../scripts/behavior-parity.mjs';
import { ADOPTION_DEFAULTS } from '../src/behaviors/adoption.js';

function actor(uid, extra = {}) {
  return {
    uid, active: true, kind: 'bear', species: 'bear', name: `actor-${uid}`,
    stage: 'adult', age: 700, scale: 1, sex: uid % 2 ? 'F' : 'M',
    cx: 0, cz: 0, cy: 1, hunger: .2, thirst: .2, energy: 1, health: 100,
    social: .3, affection: .25, bold: .5, bonds: {}, skills: {}, playdates: {},
    history: [], parentUids: [], fatherUid: 0, home: 'Home 1', grabs: 0,
    inPond: false, sleeping: false, inside: false, bedtime: 20, wakeTime: 6,
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

function setup(actors, { adoption = true, knownUids = new Set(), rng = () => .5 } = {}) {
  const clock = { hours: 12, day: 1 };
  const engine = createBehavior({
    engine: 'modules',
    config: createBehaviorConfig({ features: { adoption } }),
    field: createWorld(),
    getActors: () => actors,
    getHours: () => clock.hours,
    getDay: () => clock.day,
    getPopulationCap: () => 40,
    getKnownActorUids: knownUids === null ? null : () => knownUids,
    rng,
  });
  engine.registerAdapter('softbody', adapter());
  for (const entry of actors) engine.attach(entry);
  return { engine, clock };
}

function thinkNow(engine, child) {
  child.ai.nextThink = 0;
  child.ai.taskCooldown = 0;
  engine.tick(child, .1, { ready: true });
}

test('relatives outrank household and bonded guardians', () => {
  const child = actor(10, { stage: 'baby', parentUids: [99], home: 'Home 2' });
  const sibling = actor(20, { parentUids: [99], home: 'Home 3' });
  const household = actor(21, { home: 'Home 2' });
  const bonded = actor(22, { home: 'Home 4' });
  child.bonds[22] = .9;
  bonded.bonds[10] = .9;
  const { engine } = setup([child, sibling, household, bonded]);
  thinkNow(engine, child);
  assert.equal(child.guardianUid, sibling.uid);
  assert.equal(child.parentUids[0], 99, 'ancestry is untouched');
  assert.equal(child.home, 'Home 2', 'home is untouched');
  assert.equal(engine.api.adoption(child).target, sibling.uid);
});

test('household adult outranks a bond, and sub-threshold bonds do not qualify', () => {
  const child = actor(10, { stage: 'baby', parentUids: [99], home: 'Home 2' });
  const household = actor(21, { home: 'Home 2' });
  const weak = actor(22, { home: 'Home 3' });
  child.bonds[22] = .34;
  const { engine } = setup([child, household, weak]);
  thinkNow(engine, child);
  assert.equal(child.guardianUid, household.uid, 'a weak bond cannot beat a household adult');

  child.guardianUid = undefined;
  child.ai.adoptionRetryAt = 0;
  household.home = 'Home 9';
  thinkNow(engine, child);
  assert.equal(child.guardianUid, undefined, '0.34 is below the 0.35 bond floor');
});

test('guardian selection is same-species only and deterministic on ties', () => {
  const child = actor(10, { stage: 'baby', parentUids: [99], home: 'Home 2' });
  const otherSpecies = actor(22, { species: 'msn', home: 'Home 2' });
  const first = actor(30, { home: 'Home 2' });
  const second = actor(31, { home: 'Home 2' });
  const { engine } = setup([child, otherSpecies, second, first]);
  thinkNow(engine, child);
  assert.equal(child.guardianUid, 30, 'lowest uid breaks a household tie');
  assert.equal(otherSpecies.guardianUid, undefined);
});

test('follow.seek keeps order 90 while adoption is enabled', () => {
  const child = actor(10, { stage: 'baby', home: 'Home 2' });
  const { engine } = setup([child]);
  const opportunity = engine.api.opportunities.find(item => item.id === 'follow.seek');
  assert.equal(opportunity.order, 90);
});

test('a grandparent is not recoverable without the absent parent record', () => {
  const child = actor(10, { stage: 'baby', parentUids: [50], home: 'Home 2' });
  // The absent parent 50 owns the link to 30; without that record the game
  // cannot tell that 30 is a grandparent.
  const grandparent = actor(30, { parentUids: [], home: 'Home 3' });
  const { engine } = setup([child, grandparent]);
  thinkNow(engine, child);
  assert.equal(child.guardianUid, undefined);
  assert.equal(engine.api.adoption(child).orphan, true);
});

test('competing babies fill the guardian capacity deterministically', () => {
  const babies = [10, 11, 12, 13].map(uid =>
    actor(uid, { stage: 'baby', parentUids: [99], home: 'Home 2' }));
  const guardian = actor(30, { home: 'Home 2' });
  const { engine } = setup([...babies, guardian]);
  // Assignment order is the roster order; a real think may defer while a baby
  // is in a family task, so exercise the adoption decision directly here.
  for (const baby of babies) engine.api.reconcileAdoption(baby);
  assert.deepEqual(babies.map(baby => baby.guardianUid), [30, 30, 30, undefined]);
});

test('a missing guardian is cleared even while the child is paired', () => {
  const child = actor(10, { stage: 'baby', parentUids: [99], home: 'Home 2', guardianUid: 30 });
  const { engine } = setup([child]);
  child.ai.partner = actor(31);
  assert.equal(engine.api.reconcileAdoption(child), true);
  assert.equal(child.guardianUid, undefined);
});

test('a Glass baby uses a Glass guardian', () => {
  const child = actor(10, {
    stage: 'baby', species: 'glass', kind: 'glass', parentUids: [99], home: 'Home 2',
  });
  const bear = actor(30, { home: 'Home 2' });
  const glass = actor(31, { species: 'glass', kind: 'glass', home: 'Home 3' });
  child.bonds[31] = .4;
  const { engine } = setup([child, bear, glass]);
  thinkNow(engine, child);
  assert.equal(child.guardianUid, glass.uid);
});

test('a guardian already holding more than two babies is skipped', () => {
  const child = actor(10, { stage: 'baby', parentUids: [99], home: 'Home 2' });
  const full = actor(30, { home: 'Home 2' });
  const spare = actor(31, { home: 'Home 3' });
  child.bonds[31] = .4;
  const dependents = [40, 41, 42].map(uid => actor(uid, {
    stage: 'baby', parentUids: [98], home: 'Home 2', guardianUid: 30,
  }));
  const { engine } = setup([child, full, spare, ...dependents]);
  thinkNow(engine, child);
  assert.equal(child.guardianUid, 31, 'three existing dependents exceeds the cap');
  assert.equal(ADOPTION_DEFAULTS.maxDependents, 2);

  full.home = child.home;
  const two = [40, 41].map(uid => actor(uid, {
    stage: 'baby', parentUids: [98], home: 'Home 2', guardianUid: 30,
  }));
  const second = setup([child, full, spare, ...two]);
  child.guardianUid = undefined;
  child.ai.adoptionRetryAt = 0;
  thinkNow(second.engine, child);
  assert.equal(child.guardianUid, 30, 'two dependents still allows a third');
});

test('guardian capacity counts biological babies and deduplicates responsibility', () => {
  const child = actor(10, { stage: 'baby', parentUids: [99], home: 'Home 2' });
  const full = actor(30, { home: 'Home 2' });
  const spare = actor(31, { home: 'Home 3' });
  child.bonds[31] = .4;
  const biological = [40, 41, 42].map(uid =>
    actor(uid, { stage: 'baby', parentUids: [30], home: 'Home 2' }));
  const first = setup([child, full, spare, ...biological]);
  thinkNow(first.engine, child);
  assert.equal(child.guardianUid, 31, 'three biological babies fill the guardian');

  const one = actor(40, { stage: 'baby', parentUids: [30], home: 'Home 2' });
  const both = actor(41, {
    stage: 'baby', parentUids: [30], guardianUid: 30, home: 'Home 2',
  });
  const second = setup([child, full, spare, one, both]);
  child.guardianUid = undefined;
  child.ai.adoptionRetryAt = 0;
  thinkNow(second.engine, child);
  assert.equal(child.guardianUid, 30, 'a baby counted as both parent and guardian counts once');
});

test('no candidate leaves the child alone and retries after one game-hour', () => {
  const child = actor(10, { stage: 'baby', parentUids: [99], home: 'Home 2' });
  const { engine, clock } = setup([child]);
  thinkNow(engine, child);
  assert.equal(child.guardianUid, undefined);
  assert.equal(child.ai.adoptionRetryAt, 37, '12:00 + one hour');

  const candidate = actor(30, { home: 'Home 2' });
  const list = engine.actors;
  list.push(candidate);
  engine.attach(candidate);
  clock.hours = 12.5;
  thinkNow(engine, child);
  assert.equal(child.guardianUid, undefined, 'the hourly retry has not elapsed');
  clock.hours = 13.1;
  thinkNow(engine, child);
  assert.equal(child.guardianUid, 30);
});

test('assignment waits for pairs and family tasks, then resumes', () => {
  const child = actor(10, { stage: 'baby', parentUids: [99], home: 'Home 2' });
  const candidate = actor(30, { home: 'Home 2' });
  const { engine } = setup([child, candidate]);
  child.ai.partner = actor(31);
  thinkNow(engine, child);
  assert.equal(child.guardianUid, undefined);
  child.ai.partner = null;
  child.ai.familyTask = { id: 'meal' };
  thinkNow(engine, child);
  assert.equal(child.guardianUid, undefined);
  child.ai.familyTask = null;
  thinkNow(engine, child);
  assert.equal(child.guardianUid, 30);
});

test('a returning parent clears the guardian and becomes the follow target', () => {
  const child = actor(10, { stage: 'baby', parentUids: [3], home: 'Home 2', guardianUid: 30 });
  const guardian = actor(30, { home: 'Home 2' });
  const parent = actor(3, { home: 'Home 3' });
  const { engine } = setup([child, guardian, parent], { knownUids: new Set([3]) });
  thinkNow(engine, child);
  assert.equal(child.guardianUid, undefined);
  assert.equal(engine.api.followTargetFor(child), parent);
  assert.equal(engine.api.adoption(child).parent, 3);
});

test('disabling adoption stops guardian follow but preserves the saved link', () => {
  const child = actor(10, { stage: 'baby', parentUids: [99], home: 'Home 2', guardianUid: 30 });
  const guardian = actor(30, { home: 'Home 2', cx: 5 });
  const { engine } = setup([child, guardian]);
  child.ai.state = 'follow';
  child.ai.follow = guardian;
  child.ai.path = [{ x: 5, z: 0 }];
  assert.equal(engine.setFeature('adoption', false), true);
  assert.equal(child.ai.state, 'wander');
  assert.equal(child.ai.follow, null);
  assert.equal(child.ai.path, null);
  assert.equal(child.guardianUid, 30, 'the saved guardian relationship is preserved');
  assert.equal(engine.api.followTargetFor(child), null);

  assert.equal(engine.setFeature('adoption', true), true);
  assert.equal(engine.api.followTargetFor(child), guardian);
});

test('re-enabling adoption drops a guardian that became invalid', () => {
  const child = actor(10, { stage: 'baby', parentUids: [99], home: 'Home 2', guardianUid: 30 });
  const guardian = actor(30, { home: 'Home 2' });
  const { engine } = setup([child, guardian]);
  engine.setFeature('adoption', false);
  guardian.active = false;
  engine.setFeature('adoption', true);
  engine.api.reconcileAdoption(child);
  assert.equal(child.guardianUid, undefined);
  assert.equal(engine.api.followTargetFor(child), null);
});

test('disabling adoption leaves a parent follow untouched', () => {
  const child = actor(10, { stage: 'baby', parentUids: [3], home: 'Home 2', guardianUid: 30 });
  const parent = actor(3, { home: 'Home 3', cx: 5 });
  const guardian = actor(30, { home: 'Home 2' });
  const { engine } = setup([child, parent, guardian]);
  child.ai.state = 'follow';
  child.ai.follow = parent;
  engine.setFeature('adoption', false);
  assert.equal(child.ai.state, 'follow');
  assert.equal(child.ai.follow, parent);
});

test('a returning parent replaces an active guardian follow', () => {
  const child = actor(10, { stage: 'baby', parentUids: [3], home: 'Home 2', guardianUid: 30 });
  const guardian = actor(30, { home: 'Home 2', cx: 5, cz: 0 });
  const parent = actor(3, { home: 'Home 3', cx: 10, cz: 0 });
  const { engine } = setup([child, guardian, parent], { knownUids: new Set([3]) });
  child.ai.state = 'follow';
  child.ai.follow = guardian;
  child.ai.target = { x: guardian.cx, z: guardian.cz };
  engine.tick(child, .1, { ready: true });
  assert.notEqual(child.ai.follow, guardian);
  for (let i = 0; i < 10 && child.ai.follow !== parent; i++) {
    child.ai.nextThink = 0;
    engine.tick(child, .1, { ready: true });
  }
  assert.equal(child.ai.state, 'follow');
  assert.equal(child.ai.follow, parent);
});

test('a departed or invalid guardian is cleared', () => {
  const child = actor(10, { stage: 'baby', parentUids: [99], home: 'Home 2', guardianUid: 30 });
  const guardian = actor(30, { home: 'Home 2' });
  const { engine } = setup([child, guardian]);
  guardian.active = false;
  thinkNow(engine, child);
  assert.equal(child.guardianUid, undefined);
  assert.equal(engine.api.followTargetFor(child), null);

  child.guardianUid = 31;
  thinkNow(engine, child);
  assert.equal(child.guardianUid, undefined, 'a missing guardian is cleared');
});

test('stage-up clears the guardian', () => {
  const child = actor(10, { stage: 'baby', home: 'Home 2', guardianUid: 30 });
  const guardian = actor(30, { home: 'Home 2' });
  const { engine } = setup([child, guardian]);
  child.stage = 'teen';
  thinkNow(engine, child);
  assert.equal(child.guardianUid, undefined);
});

test('a parent known on the other map prevents adoption', () => {
  const child = actor(10, { stage: 'baby', parentUids: [7], home: 'Home 2' });
  const candidate = actor(30, { home: 'Home 2' });
  const { engine } = setup([child, candidate], { knownUids: new Set([7]) });
  thinkNow(engine, child);
  assert.equal(child.guardianUid, undefined);
  const info = engine.api.adoption(child);
  assert.equal(info.parentElsewhere, true);
  assert.equal(info.orphan, false);
});

test('an unavailable roster defers a parented baby but not a parentless one', () => {
  const child = actor(10, { stage: 'baby', parentUids: [7], home: 'Home 2' });
  const candidate = actor(30, { home: 'Home 2' });
  const parented = setup([child, candidate], { knownUids: null });
  thinkNow(parented.engine, child);
  assert.equal(child.guardianUid, undefined);
  assert.equal(parented.engine.api.adoption(child).rosterUnknown, true);

  const orphan = actor(11, { stage: 'baby', parentUids: [], home: 'Home 2' });
  const orphaned = setup([orphan, candidate], { knownUids: null });
  thinkNow(orphaned.engine, orphan);
  assert.equal(orphan.guardianUid, 30, 'no parent UID exists at all');
});

test('adoption off leaves the baby untouched and does not draw RNG', () => {
  const child = actor(10, { stage: 'baby', parentUids: [99], home: 'Home 2' });
  const candidate = actor(30, { home: 'Home 2' });
  const { engine } = setup([child, candidate], { adoption: false });
  thinkNow(engine, child);
  assert.equal(child.guardianUid, undefined);
  assert.equal(engine.api.followTargetFor(child), null);
  assert.equal(engine.stats().adoptions, 0);
  assert.equal('adoptionRetryAt' in child.ai, false);

  let draws = 0;
  const next = mulberry32(4);
  const counted = () => { draws++; return next(); };
  const orphan = actor(10, { stage: 'baby', parentUids: [99], home: 'Home 2' });
  const control = setup([orphan, actor(30, { home: 'Home 2' })], { rng: counted });
  const baseline = draws;
  assert.equal(control.engine.api.reconcileAdoption(orphan), true);
  assert.equal(orphan.guardianUid, 30);
  assert.equal(draws, baseline, 'assignment itself adds no RNG draw');
});

test('enabled adoption is deterministic for the same seed', () => {
  const build = () => {
    const child = actor(10, { stage: 'baby', parentUids: [99], home: 'Home 2', cx: 0, cz: 0 });
    const guardian = actor(30, { home: 'Home 2', cx: 8, cz: 0 });
    const other = actor(31, { home: 'Home 3', cx: 2, cz: 4 });
    child.bonds[31] = .2;
    const run = setup([child, guardian, other], { rng: mulberry32(9) });
    return { ...run, child };
  };
  const trace = run => {
    const frames = [];
    const warn = console.warn;
    console.warn = () => {};
    try {
      for (let tick = 0; tick < 200; tick++) {
        run.engine.tick(run.child, .1, { ready: true });
        frames.push([run.child.ai.state, run.child.guardianUid || null,
          run.child.ai.adoptionRetryAt || 0]);
      }
    } finally {
      console.warn = warn;
    }
    return frames;
  };
  const first = build();
  const second = build();
  assert.deepEqual(trace(first), trace(second));
  assert.equal(first.child.guardianUid, 30);
});

test('the follow opportunity targets the guardian when no parent is active', () => {
  const child = actor(10, { stage: 'baby', home: 'Home 2', guardianUid: 30, cx: 0, cz: 0 });
  const guardian = actor(30, { home: 'Home 2', cx: 10, cz: 0 });
  const { engine } = setup([child, guardian]);
  thinkNow(engine, child);
  assert.equal(engine.api.followTargetFor(child), guardian);
  for (let i = 0; i < 10 && child.ai.state !== 'follow'; i++) {
    child.ai.nextThink = 0;
    engine.tick(child, .1, { ready: true });
  }
  assert.equal(child.ai.state, 'follow');
  assert.equal(child.ai.follow, guardian);
});
