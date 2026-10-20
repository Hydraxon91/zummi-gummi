import test from 'node:test';
import assert from 'node:assert/strict';
import { defineBehaviorModule, moduleSummary } from '../src/behaviors/module.js';
import { hiveModule, HIVE_DEFAULTS } from '../src/behaviors/hive.js';
import { createBehaviorConfig } from '../src/behaviors/config.js';

test('hive module declares its states, defaults and deterministic order', () => {
  assert.equal(hiveModule.id, 'hive');
  assert.deepEqual(hiveModule.states, ['seekHive', 'raidHive']);
  assert.equal(hiveModule.defaults.enabled, true);
  assert.equal(hiveModule.opportunities.length, 1);
  assert.equal(hiveModule.opportunities[0].id, 'hive.seek');
  assert.equal(hiveModule.opportunities[0].order, 40);
  assert.equal(Object.isFrozen(hiveModule), true);
  assert.equal(Object.isFrozen(hiveModule.states), true);
  assert.equal(Object.isFrozen(hiveModule.defaults.params), true);
});

test('hive canRun matches the legacy gates without drawing RNG', () => {
  const config = createBehaviorConfig();
  let draws = 0;
  const ctx = (species, hunger, health, bold) => ({
    actor: { uid: 1, species, kind: species === 'glass' ? 'glass' : 'bear', hunger, health, bold, sleeping: false },
    ai: { state: 'wander' },
    p: config.forActor({ uid: 1, species, kind: species === 'glass' ? 'glass' : 'bear' }),
    rng: () => { draws++; return .5; },
  });
  const canRun = hiveModule.opportunities[0].canRun;

  assert.equal(canRun(ctx('bear', .96, 100, .5)), true);
  assert.equal(canRun(ctx('bear', .90, 100, .5)), false);
  assert.equal(canRun(ctx('glass', .99, 100, .5)), false, 'Glass has no hive module');
  assert.equal(draws, 0);
});

test('hive threshold follows boldness, desperation and skill', () => {
  const config = createBehaviorConfig();
  const actor = {
    uid: 1, species: 'bear', kind: 'bear', hunger: .5, health: 100, bold: .5,
    skills: { forage: 0, courage: 0, social: 0 },
  };
  const ctx = { actor, p: config.forActor(actor) };
  // 45 + (0.5 - 0.5) * 30 = 45 at neutral boldness and no skill.
  assert.equal(hiveModule.threshold(ctx), 45);

  actor.skills.courage = .5;
  assert.equal(hiveModule.threshold({ actor, p: config.forActor(actor) }), 40);

  actor.hunger = .95;
  actor.skills.courage = 0;
  assert.equal(hiveModule.threshold({ actor, p: config.forActor(actor) }), 40);
});

test('hive defaults are the current Bear values', () => {
  assert.deepEqual(HIVE_DEFAULTS, {
    hunger: .95, health: 45, hardFloor: 25, damage: 15,
    stingChance: .5, dist: 1.25, raidTime: 1.25, fleeTime: 1.4,
  });
});

test('module definitions are validated and frozen', () => {
  assert.throws(() => defineBehaviorModule(), /definition required/);
  assert.throws(() => defineBehaviorModule({ id: 'x', states: [], defaults: {} }), /non-empty/);
  assert.throws(() => defineBehaviorModule({
    id: 'x', states: ['a'], defaults: {}, opportunities: [{ id: 'o', order: 1 }],
  }), /needs enter/);
  assert.throws(() => defineBehaviorModule({
    id: 'x', states: ['a'], defaults: {},
    opportunities: [{ id: 'o', enter: () => true }],
  }), /numeric order/);

  const mod = defineBehaviorModule({
    id: 'x', label: 'X', states: ['a'], defaults: { enabled: false, params: { speed: 2 } },
    opportunities: [{ id: 'x.a', order: 10, enter: () => true }],
  });
  assert.equal(mod.defaults.enabled, false);
  assert.deepEqual(moduleSummary(mod), {
    id: 'x', label: 'X', states: ['a'], opportunities: ['x.a'],
  });
});
