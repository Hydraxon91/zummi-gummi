import test from 'node:test';
import assert from 'node:assert/strict';
import { birthSpecies, planBirth } from '../src/actorbirth.js';
import { MATE_FOOD_MIN } from '../src/life.js';

const BEAR = { id: 'bear', canReproduce: true, rig: 'bear', material: 'bearGummy', genetics: { phenotype: { kind: 'bear' } } };
const GLASS = { id: 'glass', canReproduce: true, rig: null, material: 'glass', genetics: { phenotype: { kind: 'glass' } } };
const MSN = { id: 'msn', canReproduce: true, rig: 'msn', material: 'msn', genetics: { phenotype: { kind: 'msn' } } };

function mother(over = {}) {
  return {
    uid: 10,
    active: true,
    pregnant: true,
    grabs: 0,
    inPond: false,
    airborne: false,
    freeBody: false,
    sleeping: false,
    inside: false,
    flavor: 2,
    cx: 1.5,
    cz: -2.5,
    fatherUid: 11,
    def: BEAR,
    ...over,
  };
}

function father(over = {}) {
  return { uid: 11, active: true, def: BEAR, ...over };
}

function makeHost(overrides = {}) {
  const calls = [];
  const definitions = {
    speciesOf: (actor) => actor?.def || null,
    fatherByUid: null,
    safeFood: MATE_FOOD_MIN,
    softCount: 0,
    softCapacity: 8,
    chooseHome: 'Home 1',
    homeDoor: { x: 5, z: 6 },
    nearestWalkable: null,
    childGenome: () => ({ genes: { size: 1 } }),
    random: 0.5,
    ...overrides,
  };
  const host = {};
  for (const [name, value] of Object.entries(definitions)) {
    host[name] = (...args) => {
      calls.push([name, ...args]);
      return typeof value === 'function' ? value(...args) : value;
    };
  }
  return { host, calls };
}

function callNames(calls) {
  return calls.map(([name]) => name);
}

test('birthSpecies keeps the existing cross-species draw and fallback order', () => {
  const same = birthSpecies(mother(), father(), {
    speciesOf: (actor) => actor.def,
    random: () => { throw new Error('same-species must not draw'); },
  });
  assert.equal(same, BEAR);

  const draws = [];
  const cross = birthSpecies(mother({ def: BEAR }), father({ def: GLASS }), {
    speciesOf: (actor) => actor.def,
    random: () => { draws.push('draw'); return 0.99; },
  });
  assert.equal(cross, GLASS);
  assert.equal(draws.length, 1);

  const first = birthSpecies(mother({ def: BEAR }), father({ def: GLASS }), {
    speciesOf: (actor) => actor.def,
    random: () => 0,
  });
  assert.equal(first, BEAR);

  const fallbackMother = mother({ def: BEAR });
  const fallback = birthSpecies(fallbackMother, null, {
    speciesOf: (actor) => actor.def,
    random: () => { throw new Error('fallback must not draw'); },
  });
  assert.equal(fallback, BEAR);

  const noReproducer = { id: 'child', canReproduce: false };
  const nonBreeding = birthSpecies(mother({ def: noReproducer }), father({ def: noReproducer }), {
    speciesOf: (actor) => actor.def,
    random: () => { throw new Error('non-breeding fallback must not draw'); },
  });
  assert.equal(nonBreeding, noReproducer);
});

test('inactive or non-pregnant mothers reject before later hosts and without mutation', () => {
  for (const value of [null, mother({ active: false }), mother({ pregnant: false })]) {
    const random = () => { throw new Error('early rejection must not draw'); };
    const { host, calls } = makeHost({ random });
    const snapshot = value ? structuredClone(value) : null;
    const plan = planBirth(value, null, host);
    assert.equal(plan.ok, false);
    assert.equal(plan.reason, 'inactive-mother');
    assert.deepEqual(callNames(calls), []);
    if (value) assert.deepEqual(value, snapshot);
  }
});

test('grabbed, pond, airborne and free-body mothers reject before safe food and RNG', () => {
  const states = [
    { grabs: 1 },
    { inPond: true },
    { airborne: true },
    { freeBody: true },
  ];
  for (const state of states) {
    const random = () => { throw new Error('busy rejection must not draw'); };
    const { host, calls } = makeHost({ random });
    const m = mother(state);
    const snapshot = structuredClone(m);
    const plan = planBirth(m, null, host);
    assert.equal(plan.ok, false);
    assert.equal(plan.reason, 'busy-mother');
    assert.deepEqual(callNames(calls), []);
    assert.deepEqual(m, snapshot);
  }
});

test('safe-food threshold gates father resolution and emits no RNG below it', () => {
  const random = () => { throw new Error('food rejection must not draw'); };
  const blockedHost = makeHost({ safeFood: MATE_FOOD_MIN - 1, random });
  const blocked = planBirth(mother(), null, blockedHost.host);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.reason, 'insufficient-safe-food');
  assert.deepEqual(callNames(blockedHost.calls), ['safeFood']);

  const passingHost = makeHost({
    safeFood: MATE_FOOD_MIN,
    fatherByUid: father(),
  });
  const plan = planBirth(mother(), null, passingHost.host);
  assert.equal(plan.ok, true);
  assert.equal(plan.father.uid, 11);
  assert.ok(callNames(passingHost.calls).includes('fatherByUid'));
});

test('missing child species rejects after father resolution and before placement/genome/RNG', () => {
  const random = () => { throw new Error('missing species must not draw'); };
  const { host, calls } = makeHost({
    speciesOf: () => null,
    random,
  });
  const plan = planBirth(mother(), null, host);
  assert.equal(plan.ok, false);
  assert.equal(plan.reason, 'missing-child-species');
  assert.deepEqual(callNames(calls), ['safeFood', 'fatherByUid', 'speciesOf', 'speciesOf', 'speciesOf']);
  assert.equal(calls.some(([name]) => ['chooseHome', 'childGenome', 'random'].includes(name)), false);
});

test('non-Glass soft cap blocks while Glass bypasses it', () => {
  const bearHost = makeHost({ softCount: 8, softCapacity: 8 });
  const bearPlan = planBirth(mother(), null, bearHost.host);
  assert.equal(bearPlan.ok, false);
  assert.equal(bearPlan.reason, 'soft-capacity');

  const belowHost = makeHost({ softCount: 7, softCapacity: 8, fatherByUid: father() });
  const below = planBirth(mother(), null, belowHost.host);
  assert.equal(below.ok, true);
  assert.equal(below.isGlass, false);
  assert.equal(below.childSpecies, BEAR);

  const glassHost = makeHost({
    speciesOf: (actor) => (actor?.def?.id === 'glass' ? GLASS : null),
    softCount: 100,
    softCapacity: 8,
    fatherByUid: null,
  });
  const glassPlan = planBirth(mother({ def: GLASS, fatherUid: 0 }), null, glassHost.host);
  assert.equal(glassPlan.ok, true);
  assert.equal(glassPlan.isGlass, true);
  assert.equal(glassPlan.childSpecies, GLASS);

  const msnHost = makeHost({
    speciesOf: (actor) => (actor?.def?.id === 'msn' ? MSN : null),
    softCount: 8,
    softCapacity: 8,
  });
  const msnPlan = planBirth(mother({ def: MSN, fatherUid: 0 }), null, msnHost.host);
  assert.equal(msnPlan.ok, false);
  assert.equal(msnPlan.reason, 'soft-capacity');
});

test('father resolution prefers the explicit father and falls back to mother.fatherUid', () => {
  const explicit = father({ uid: 44 });
  const explicitHost = makeHost();
  const explicitPlan = planBirth(mother(), explicit, explicitHost.host);
  assert.equal(explicitPlan.father, explicit);
  assert.deepEqual(explicitPlan.parentUids, [10, 44]);
  assert.equal(callNames(explicitHost.calls).includes('fatherByUid'), false);

  const resolved = father();
  const fallbackHost = makeHost({ fatherByUid: resolved });
  const fallbackPlan = planBirth(mother(), null, fallbackHost.host);
  assert.equal(fallbackPlan.father, resolved);
  assert.deepEqual(fallbackPlan.parentUids, [10, 11]);
  assert.deepEqual(fallbackHost.calls.find(([name]) => name === 'fatherByUid'), ['fatherByUid', 11]);

  const missingHost = makeHost({ fatherByUid: null });
  const missingPlan = planBirth(mother(), null, missingHost.host);
  assert.equal(missingPlan.father, null);
  assert.deepEqual(missingPlan.parentUids, [10]);
});

test('cross-species plan draws once, then flavor, pace, genome and sex in that order', () => {
  const events = [];
  const draws = [];
  const random = () => {
    draws.push(draws.length + 1);
    events.push(`rng${draws.length}`);
    return 0.5;
  };
  const genome = { genes: { size: 1 } };
  const { host } = makeHost({
    speciesOf: (actor) => actor.def,
    fatherByUid: father({ def: GLASS }),
    chooseHome: () => { events.push('home'); return 'Home 1'; },
    nearestWalkable: () => { events.push('nearest'); return null; },
    childGenome: () => {
      events.push('genome');
      return genome;
    },
    random,
  });
  const m = mother({ def: BEAR });
  const f = father({ def: GLASS });
  const plan = planBirth(m, f, host);

  assert.equal(plan.ok, true);
  // Cross-species draw, flavor check, two pace draws, sexual draw.
  assert.equal(draws.length, 5);
  assert.equal(plan.childSpecies, GLASS);
  assert.equal(plan.flavor, 2);
  assert.deepEqual(plan.pace, { min: 0.8, max: 1.65 });
  assert.equal(plan.genome, genome);
  assert.equal(plan.sex, 'M');
  assert.deepEqual(plan.parentUids, [10, 11]);

  const genomeAt = events.indexOf('genome');
  const homeAt = events.indexOf('home');
  const nearestAt = events.indexOf('nearest');
  assert.ok(homeAt > 0 && nearestAt > homeAt, `placement before genome: ${events}`);
  assert.ok(genomeAt > nearestAt, `genome after placement: ${events}`);
  assert.deepEqual(events.slice(genomeAt + 1), ['rng5'], 'sex is the last draw after genome');

  // Fixed draw order: cross-species, flavor, pace min, pace max, sex.
  assert.deepEqual(events.filter((event) => event.startsWith('rng')), ['rng1', 'rng2', 'rng3', 'rng4', 'rng5']);
});

test('sleeping or inside mothers use the home door; otherwise the mother position is kept', () => {
  for (const state of [{ sleeping: true }, { inside: true }]) {
    const { host, calls } = makeHost({
      chooseHome: 'Home 2',
      homeDoor: { x: 5, z: 6 },
      nearestWalkable: null,
    });
    const plan = planBirth(mother({ ...state, cx: 1.5, cz: -2.5 }), null, host);
    assert.equal(plan.ok, true);
    assert.equal(plan.home, 'Home 2');
    assert.equal(plan.x, 5);
    assert.equal(plan.z, 6);
    assert.deepEqual(calls.find(([name]) => name === 'homeDoor'), ['homeDoor', 'Home 2']);
    assert.deepEqual(calls.find(([name]) => name === 'nearestWalkable'), ['nearestWalkable', 5, 6]);
  }

  const awakeHost = makeHost({ chooseHome: 'Home 2', homeDoor: { x: 5, z: 6 } });
  const awake = planBirth(mother(), null, awakeHost.host);
  assert.equal(awake.ok, true);
  assert.equal(awake.x, 1.5);
  assert.equal(awake.z, -2.5);
  assert.equal(callNames(awakeHost.calls).includes('homeDoor'), false);

  const noHomeHost = makeHost({ chooseHome: null });
  const noHome = planBirth(mother({ sleeping: true }), null, noHomeHost.host);
  assert.equal(noHome.x, 1.5);
  assert.equal(noHome.z, -2.5);
  assert.equal(callNames(noHomeHost.calls).includes('homeDoor'), false);
});

test('nearestWalkable overrides placement and its null fallback keeps the original point', () => {
  const far = makeHost({ nearestWalkable: { x: 9, z: -9 } });
  const farPlan = planBirth(mother({ sleeping: true }), null, far.host);
  assert.equal(farPlan.x, 9);
  assert.equal(farPlan.z, -9);

  const none = makeHost({ nearestWalkable: null });
  const nonePlan = planBirth(mother({ sleeping: true }), null, none.host);
  assert.equal(nonePlan.x, 5);
  assert.equal(nonePlan.z, 6);
});

test('successful planning does not mutate the mother, father or host inputs', () => {
  const m = mother({ sleeping: true, inside: true });
  const f = father();
  const mSnapshot = structuredClone(m);
  const fSnapshot = structuredClone(f);
  const { host } = makeHost({ fatherByUid: f });
  const plan = planBirth(m, null, host);
  assert.equal(plan.ok, true);
  assert.deepEqual(m, mSnapshot);
  assert.deepEqual(f, fSnapshot);
  assert.equal(plan.father, f);
});
