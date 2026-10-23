import test from 'node:test';
import assert from 'node:assert/strict';
import { createBehaviorConfig } from '../src/behaviors/config.js';
import { conflictModule } from '../src/behaviors/conflict.js';

const config = createBehaviorConfig();
const p = config.forActor({ uid: 1, species: 'bear', kind: 'bear', hunger: .8, health: 100, bold: .5, energy: 1, skills: {} });

function actors() {
  const a = {
    uid: 1, active: true, kind: 'bear', species: 'bear', sex: 'F', stage: 'adult', scale: 1,
    cx: 0, cz: 0, hunger: .8, bold: .5, energy: 1, health: 100, social: .3, affection: .25,
    bonds: {}, history: [], grabs: 0, inPond: false, sleeping: false,
    ai: { state: 'conflict', conflictT: .1, conflictSource: null, partner: null, contestSource: null, contestBear: null, socialCooldown: 0, conflictCooldown: 0, taskCooldown: 0 },
  };
  const b = {
    uid: 2, active: true, kind: 'bear', species: 'bear', sex: 'M', stage: 'adult', scale: 1,
    cx: .5, cz: 0, hunger: .8, bold: .5, energy: 1, health: 100, social: .3, affection: .25,
    bonds: {}, history: [], grabs: 0, inPond: false, sleeping: false,
    ai: { state: 'conflict', conflictT: .1, conflictSource: null, partner: null, contestSource: null, contestBear: null, socialCooldown: 0, conflictCooldown: 0, taskCooldown: 0 },
  };
  a.ai.partner = b;
  b.ai.partner = a;
  a.bonds['2'] = .3;
  b.bonds['1'] = .3;
  return { a, b };
}

function context(a, b, rng, outcomes, apiExtra = {}) {
  const food = { sources: [], release: () => {}, claim: () => true };
  return {
    actor: a, ai: a.ai, p,
    rng,
    api: {
      coverConflictOutcome: (id) => { outcomes[id] = (outcomes[id] || 0) + 1; },
      profile: () => p,
      startEat: () => {},
      setDestination: () => {},
      stop: () => {},
      emit: () => {},
      releaseFood: () => {},
      food: () => food,
      field: { food },
      ...apiExtra,
    },
    field: { food },
  };
}

test('conflict tie goes to the acting actor and both weights draw in actor order', () => {
  const { a, b } = actors();
  const outcomes = {};
  conflictModule.finishConflict(context(a, b, () => .5, outcomes));
  assert.equal(outcomes.tie, 1);
  assert.equal(outcomes.actor || 0, 0);
  assert.equal(outcomes.opponent || 0, 0);
  assert.equal(a.ai.partner, null);
});

test('the two weight draws are fixed actor-then-opponent', () => {
  const { a, b } = actors();
  const outcomes = {};
  let draws = 0;
  const sequence = [.1, .9];
  conflictModule.finishConflict(context(a, b, () => sequence[draws++], outcomes));
  assert.equal(draws, 2);
  // actor gets the lower roll, so the opponent's weight wins.
  assert.equal(outcomes.opponent, 1);
  assert.equal(outcomes.actor || 0, 0);
});

test('health-floor targets findContest claimant check, not reserved conflict.healthFloor', () => {
  const { a, b } = actors();
  const outcomes = {};
  const source = {
    id: 'flower-1', kind: 'flower', ripe: true, claim: b,
    x: 1, z: 0, approachX: 1, approachZ: 0,
  };
  b.health = 10; // below profile(other).thresholds.healthWoozy
  const fair = { sources: [source], release: () => {}, claim: () => true };
  const ctx = context(a, b, () => .5, outcomes, {
    food: () => fair,
    field: { food: fair },
  });
  ctx.field = { food: fair };
  assert.equal(conflictModule.findContest(ctx), null);
  assert.equal(outcomes.healthFloor, 1);
});
