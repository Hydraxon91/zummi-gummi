import test from 'node:test';
import assert from 'node:assert/strict';
import { createBehaviorConfig, CONFIGURED_MODULE_IDS } from '../src/behaviors/config.js';
import { createBehaviorModules } from '../src/behaviors/engine.js';
import { BEHAVIOR_CONTRACTS } from '../src/behaviors/contracts.js';

function actor(uid, species = 'bear') {
  return { uid, active: true, species, kind: species === 'glass' ? 'glass' : 'bear', cx: 0, cz: 0, cy: 1 };
}

const LAYERED_IDS = BEHAVIOR_CONTRACTS
  .filter(contract => contract.configuration === 'layered')
  .map(contract => contract.id);
const PROFILE_ONLY_IDS = BEHAVIOR_CONTRACTS
  .filter(contract => contract.configuration === 'profile-only')
  .map(contract => contract.id);

test('source-registered layered IDs are accepted at global, species and actor scope', () => {
  assert.deepEqual([...CONFIGURED_MODULE_IDS].sort(), [...LAYERED_IDS].sort());
  for (const id of CONFIGURED_MODULE_IDS) {
    const config = createBehaviorConfig();
    assert.equal(config.setModuleEnabled(id, true), true, id);
    assert.equal(config.setModuleEnabled(id, true, { species: 'bear' }), true, `${id} species`);
    assert.equal(config.setModuleEnabled(id, false, { uid: 1 }), true, `${id} actor`);
    assert.equal(config.setModuleParams(id, { conformance: 1 }), true, `${id} params`);
    assert.equal(config.setModuleParams(id, { conformance: 1 }, { species: 'bear' }), true, `${id} species params`);
    assert.equal(config.setActorConfig(1, { [id]: { enabled: true } }), true, `${id} flat actor`);
    assert.equal(config.setActorConfig(1, { modules: { [id]: { params: { conformance: 1 } } } }), true,
      `${id} wrapped actor`);
  }
});

test('unknown, malformed and inherited IDs are rejected with no version or cache change', () => {
  const invalidIds = [
    'nope', '', null, undefined, 7, true, {}, [],
    'constructor', 'toString', '__proto__', 'hasOwnProperty',
  ];
  for (const id of invalidIds) {
    const config = createBehaviorConfig();
    const bear = actor(1);
    assert.equal(config.setModuleEnabled('hive', false), true);
    assert.equal(config.setActorConfig(1, { hive: { params: { hunger: .7 } } }), true);
    const before = config.forActor(bear);
    const version = config.getVersion();
    const label = String(id);

    assert.equal(config.setModuleEnabled(id, true), false, `enabled ${label}`);
    assert.equal(config.setModuleParams(id, {}), false, `params ${label}`);
    assert.equal(config.setActorConfig(1, { [id]: { enabled: true } }), false, `flat actor ${label}`);
    assert.equal(config.setActorConfig(1, { modules: { [id]: { enabled: true } } }), false,
      `wrapped actor ${label}`);
    assert.equal(config.getVersion(), version, `version ${label}`);
    assert.equal(config.forActor(bear), before, `cache identity ${label}`);
    assert.equal(before.behaviorModules.hive.enabled, false, `existing enabled ${label}`);
    assert.equal(before.behaviorModules.hive.params.hunger, .7, `existing params ${label}`);
  }

  // Non-string arguments are rejected by the direct setters without coercion.
  const config = createBehaviorConfig();
  assert.equal(config.setModuleEnabled(['hive'], true), false);
  assert.equal(config.setModuleParams(['hive'], {}), false);
  assert.equal(config.setModuleEnabled({ toString: () => 'hive' }, true), false);
  assert.equal(config.setModuleParams({ toString: () => 'hive' }, {}), false);
});

test('profile-only modules are not configurable and reject without mutation', () => {
  assert.equal(PROFILE_ONLY_IDS.length, 8);
  for (const id of PROFILE_ONLY_IDS) {
    assert.equal(CONFIGURED_MODULE_IDS.includes(id), false, id);
    const config = createBehaviorConfig();
    const bear = actor(2);
    const before = config.forActor(bear);
    const version = config.getVersion();
    assert.equal(config.setModuleEnabled(id, false), false, id);
    assert.equal(config.setModuleParams(id, {}), false, `${id} params`);
    assert.equal(config.setActorConfig(2, { [id]: { enabled: false } }), false, `${id} actor`);
    assert.equal(config.getVersion(), version, `${id} version`);
    assert.equal(config.forActor(bear), before, `${id} cache`);
  }
});

test('actor patches reject known plus unknown keys atomically in flat and wrapped form', () => {
  for (const knownFirst of [true, false]) {
    for (const wrapped of [false, true]) {
      const config = createBehaviorConfig();
      const bear = actor(2);
      assert.equal(config.setActorConfig(2, { hive: { enabled: false, params: { hunger: .4 } } }), true);
      const before = config.forActor(bear);
      const version = config.getVersion();
      const pair = knownFirst
        ? [['hive', { enabled: true, params: { hunger: .8 } }], ['rest', { enabled: true }]]
        : [['rest', { enabled: true }], ['hive', { enabled: true, params: { hunger: .8 } }]];
      const modules = Object.fromEntries(pair);
      const patch = wrapped ? { modules } : modules;
      assert.equal(config.setActorConfig(2, patch), false, JSON.stringify({ knownFirst, wrapped }));
      assert.equal(config.getVersion(), version);
      assert.equal(config.forActor(bear), before);
      assert.equal(before.behaviorModules.hive.enabled, false);
      assert.equal(before.behaviorModules.hive.params.hunger, .4);
    }
  }
});

test('accepted known updates keep precedence, merge and return behavior', () => {
  const config = createBehaviorConfig();
  const bear = actor(3);
  const version = config.getVersion();
  assert.equal(config.setModuleParams('hive', { nested: { a: 1, b: 2 } }), true);
  assert.equal(config.setModuleParams('hive', { nested: { b: 3 } }), true);
  assert.equal(config.getVersion(), version + 2);
  assert.deepEqual(config.forActor(bear).behaviorModules.hive.params.nested, { a: 1, b: 3 });

  assert.equal(config.setModuleEnabled('hive', false, { species: 'bear' }), true);
  assert.equal(config.setActorConfig(3, { modules: { hive: { params: { nested: { c: 4 } } } } }), true);
  const scoped = config.forActor(bear);
  assert.equal(scoped.behaviorModules.hive.enabled, false);
  assert.deepEqual(scoped.behaviorModules.hive.params.nested, { a: 1, b: 3, c: 4 });

  // Global runtime wins over species/actor, matching the documented precedence.
  assert.equal(config.setModuleEnabled('hive', true), true);
  assert.equal(config.forActor(bear).behaviorModules.hive.enabled, true);
});

test('engine wrappers only bump configVersion and invalidate the profile cache on success', () => {
  const config = createBehaviorConfig();
  const engine = createBehaviorModules({ getActors: () => [], config });
  const bear = actor(1);
  const before = engine.api.profile(bear);
  const engineVersion = engine.configVersion;
  const configVersion = config.getVersion();

  let resolutions = 0;
  const resolve = config.forActor;
  config.forActor = (...args) => { resolutions++; return resolve(...args); };

  assert.equal(engine.setModuleEnabled('rest', false), false);
  assert.equal(engine.setModuleParams('nope', {}), false);
  assert.equal(engine.setActorConfig(1, { modules: { hive: { enabled: true }, rest: { enabled: false } } }), false);
  assert.equal(engine.configVersion, engineVersion);
  assert.equal(config.getVersion(), configVersion);
  assert.equal(resolutions, 0, 'rejected setters must not resolve or invalidate the cache');
  assert.equal(engine.api.profile(bear), before);
  assert.equal(resolutions, 1);

  assert.equal(engine.setModuleEnabled('hive', false), true);
  assert.equal(engine.configVersion, engineVersion + 1);
  assert.notEqual(engine.api.profile(bear), before);
  assert.equal(resolutions, 2);
});
