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
    nav: { nearestWalkable: (x, z) => ({ x, z }), findPath: (x, z, tx, tz) => [{ x: tx, z: tz }] },
    pond: { contains: () => false },
    waterSpots: [{ x: 3, z: 0, waterX: 3, waterZ: 0 }],
    food: {
      sources: [source], allRipe: () => [source],
      nearestRipe: () => source, claim: (s, a) => { s.claim = a; return true; },
      release: (s, a) => { if (s.claim === a) s.claim = null; }, consume: () => true,
    },
    emote: () => {}, splash: () => {},
  };
}

function make(engine, aiValue = .5) {
  const world = field();
  const bears = [];
  let engineDraws = 0;
  let aiDraws = 0;
  const behavior = createBehavior({
    engine, field: world, getActors: () => bears, getHours: () => 12, getDay: () => 1,
    getPopulationCap: () => 40, rng: () => { engineDraws++; return .5; },
  });
  const ai = createBearAI({
    field: world, getBears: () => bears, getCompanions: () => bears,
    behavior, rng: () => { aiDraws++; return aiValue; },
  });
  const b = {
    uid: 1, active: true, kind: 'bear', species: 'bear', name: 'bear-1',
    cx: 0, cz: 0, cy: 1, sex: 'F', stage: 'adult', age: 700, home: 'Home 1',
    hunger: .3, thirst: .3, energy: 1, health: 100, social: .3, affection: .25,
    bold: .5, bonds: {}, skills: { forage: .3, courage: .3, social: .3 }, playdates: {}, history: [],
    grabs: 0, inPond: false, sleeping: false, inside: false,
  };
  bears.push(b);
  behavior.attach(b);
  return { b, ai, behavior, counts: () => ({ engineDraws, aiDraws }) };
}

test('directive queue uses config TTL 45 / max 3 and parity', () => {
  for (const engine of ['legacy', 'modules']) {
    const { b, ai } = make(engine);
    assert.equal(ai.issueDirective(b, 'go', { x: 1, z: 1 }).ttl, 45);
    ai.issueDirective(b, 'eat');
    ai.issueDirective(b, 'drink');
    const queued = ai.issueDirective(b, 'home');
    assert.equal(queued.queued, 3);
    assert.equal(ai.directiveState(0).queue.length, 3);
    assert.equal(ai.directiveState(0).queue[0].kind, 'eat');
  }
});

test('directive refusals and RNG stream stay separate', () => {
  for (const engine of ['legacy', 'modules']) {
    const { b, ai, counts } = make(engine, .99);
    const start = counts();
    b.hunger = .8;
    ai.issueDirective(b, 'go', { x: 2, z: 0 });
    const applied = ai.preNeeds(b);
    assert.equal(applied, false);
    assert.match(ai.directiveState(0).status.text, /hungry/);
    const after = counts();
    assert.ok(after.engineDraws === start.engineDraws, `${engine}: behavior RNG untouched by preNeeds`);
    assert.ok(after.aiDraws > start.aiDraws, `${engine}: directive RNG is its own stream`);
  }
});

test('possession clears queued directives in both engines', () => {
  for (const engine of ['legacy', 'modules']) {
    const { b, ai } = make(engine);
    ai.issueDirective(b, 'eat');
    ai.setPossessed(b, true);
    assert.equal(b.ai.directives.length, 0);
    assert.equal(ai.preNeeds(b), false);
  }
});
