import test from 'node:test';
import assert from 'node:assert/strict';
import { createBehavior } from '../src/behaviors/index.js';
import { createBearAI } from '../src/ai.js';

function field() {
  const source = {
    id: 'food-1', kind: 'flower', ripe: true, claim: null,
    x: 2, z: 0, approachX: 2, approachZ: 0, satiation: .3,
  };
  return {
    homes: [{ name: 'Home 1', x: 0, z: 0, door: { x: 1, z: 0 } }],
    nav: {
      nearestWalkable: (x, z) => ({ x, z }),
      findPath: (x, z, tx, tz) => [{ x: tx, z: tz }],
      isWalkable: () => true,
    },
    pond: { contains: () => false },
    waterSpots: [{ x: 3, z: 0, waterX: 3, waterZ: 0 }],
    food: {
      sources: [source], allRipe: () => [source],
      nearestRipe: () => source, claim: (s, a) => { s.claim = a; return true; },
      release: (s, a) => { if (s.claim === a) s.claim = null; }, consume: () => true,
    },
    emote: () => {}, emoteHouse: () => {}, splash: () => {},
  };
}

function make(engine) {
  const world = field();
  const bears = [];
  const behavior = createBehavior({
    engine, field: world, getActors: () => bears, getHours: () => 12, getDay: () => 1,
    getPopulationCap: () => 40, rng: () => .5,
  });
  const ai = createBearAI({
    field: world, getBears: () => bears, getCompanions: () => bears,
    behavior, rng: () => 0,
  });
  const b = {
    uid: 1, active: true, kind: 'bear', species: 'bear', name: 'actor-1',
    cx: 0, cz: 0, cy: 1, sex: 'F', stage: 'adult', age: 700, home: 'Home 1',
    hunger: .2, thirst: .2, energy: 1, health: 100, social: .3, affection: .25,
    bold: 1, mateCooldown: 0, bonds: {}, skills: { forage: .3, courage: .3, social: .3 },
    playdates: {}, history: [], grabs: 0, inPond: false, sleeping: false, inside: false,
  };
  bears.push(b);
  behavior.attach(b);
  return { b, ai };
}

function expire(ai, b, n) {
  const trace = [];
  for (let i = 0; i < n; i++) {
    let started = false;
    for (let attempt = 0; attempt < 20 && !started; attempt++) {
      ai.issueDirective(b, 'go', { x: 1 + i, z: 1 });
      started = ai.preNeeds(b);
      if (!started) b.ai.directives.length = 0;
    }
    assert.equal(started, true, `directive ${i} could not start`);
    const before = ai.directiveState(0);
    ai.preTick(b, 46);
    ai.preNeeds(b);
    const after = ai.directiveState(0);
    trace.push({ before, after });
  }
  return trace;
}

test('120 directive TTL expiries match between legacy and modules', () => {
  const legacy = make('legacy');
  const modules = make('modules');
  const left = expire(legacy.ai, legacy.b, 120);
  const right = expire(modules.ai, modules.b, 120);
  assert.equal(left.length, 120);
  assert.equal(right.length, 120);
  for (let i = 0; i < left.length; i++) {
    assert.deepEqual(left[i], right[i], `expiry ${i} diverged`);
    assert.ok(left[i].before.active, `expiry ${i} had no active directive`);
    assert.match(left[i].after.status.text, /expired/);
  }
  assert.equal(legacy.b.ai.directive, null);
  assert.equal(modules.b.ai.directive, null);
  console.log('directive TTL scenario: 120 expiries per engine, zero diffs');
});
