import test from 'node:test';
import assert from 'node:assert/strict';
import { createBehaviorConfig, FEATURE_DEFAULTS } from '../src/behaviors/config.js';
import { behaviorEngineFromSearch } from '../src/behaviors/index.js';
import { BEAR_PROFILE, GUMMY_PROFILE, GLASS_PROFILE, profileFor } from '../src/behaviorprofiles.js';
import { HIVE_DEFAULTS } from '../src/behaviors/hive.js';

function actor(uid, species = 'bear', extra = {}) {
  return {
    uid, active: true, species, kind: species === 'glass' ? 'glass' : 'bear',
    cx: 0, cz: 0, cy: 1, hunger: .3, thirst: .3,
    ...extra,
  };
}

test('module defaults resolve to the current Bear hive values', () => {
  const config = createBehaviorConfig();
  const resolved = config.forActor(actor(1));
  assert.ok(resolved.hive);
  for (const [key, value] of Object.entries(BEAR_PROFILE.hive)) {
    assert.equal(resolved.hive[key], value, `hive.${key}`);
  }
  for (const [key, value] of Object.entries(HIVE_DEFAULTS)) {
    assert.equal(resolved.hive[key], value, `defaults.${key}`);
  }
  // Legacy need/threshold fields stay untouched.
  assert.equal(resolved.needs.hungerRate, BEAR_PROFILE.needs.hungerRate);
  assert.equal(resolved.thresholds.seekHunger, BEAR_PROFILE.thresholds.seekHunger);
});

test('Gummy is an independent Bear clone routed by msn species', () => {
  assert.equal(profileFor({ species: 'msn' }), GUMMY_PROFILE);
  assert.equal(profileFor({ species: 'bear' }), BEAR_PROFILE);
  assert.equal(GUMMY_PROFILE.id, 'gummy');
  assert.deepEqual(GUMMY_PROFILE.species, ['msn']);
  assert.notEqual(GUMMY_PROFILE.needs, BEAR_PROFILE.needs);
  assert.deepEqual(GUMMY_PROFILE.needs, BEAR_PROFILE.needs);
  assert.deepEqual(GUMMY_PROFILE.hive, BEAR_PROFILE.hive);
});

test('Glass disables the hive module through the profile capability', () => {
  const config = createBehaviorConfig();
  const resolved = config.forActor(actor(2, 'glass'));
  assert.equal(resolved.hive, null);
  assert.equal(resolved.behaviorModules.hive.enabled, false);
  assert.equal(resolved.id, GLASS_PROFILE.id);
});

test('runtime toggles win over the race profile and are cached by version', () => {
  const config = createBehaviorConfig();
  const bear = actor(1);
  const first = config.forActor(bear);
  assert.ok(first.hive);
  assert.equal(config.forActor(bear), first, 'same version reuses the resolved object');

  config.setModuleEnabled('hive', false);
  const disabled = config.forActor(bear);
  assert.equal(disabled.hive, null);
  assert.notEqual(disabled, first);
  assert.equal(config.forActor(bear), disabled);

  config.setModuleEnabled('hive', true);
  assert.ok(config.forActor(bear).hive);
});

test('species, actor and runtime layers apply in order', () => {
  const config = createBehaviorConfig();
  const one = actor(1, 'glass');
  const two = actor(2, 'glass');

  config.setModuleEnabled('hive', true, { species: 'glass' });
  config.setModuleParams('hive', { hunger: .80 }, { species: 'glass' });
  assert.equal(config.forActor(one).hive.hunger, .80);

  config.setActorConfig(2, { modules: { hive: { enabled: true, params: { hunger: .60 } } } });
  assert.equal(config.forActor(two).hive.hunger, .60);
  assert.equal(config.forActor(one).hive.hunger, .80);

  config.setModuleParams('hive', { hunger: .50 });
  assert.equal(config.forActor(one).hive.hunger, .50);
  assert.equal(config.forActor(two).hive.hunger, .50);
});

test('features default to the legacy behavior and can be toggled', () => {
  const config = createBehaviorConfig();
  for (const [name, value] of Object.entries(FEATURE_DEFAULTS)) {
    assert.equal(value, false, `${name} default`);
    assert.equal(config.features[name], false, `${name} resolved`);
  }
  assert.equal(config.setFeature('glassNightWindow', true), true);
  assert.equal(config.features.glassNightWindow, true);
  assert.equal(config.setFeature('notAFeature', true), false);
  config.reset();
  assert.equal(config.features.glassNightWindow, false);
});

test('unknown species fall back to BEAR with one warning per species', () => {
  const config = createBehaviorConfig();
  const warnings = [];
  const original = console.warn;
  console.warn = (...args) => warnings.push(args.join(' '));
  try {
    const resolved = config.forActor(actor(9, 'unicorn'));
    assert.equal(resolved.id, BEAR_PROFILE.id);
    assert.ok(resolved.hive);
    config.forActor(actor(10, 'unicorn'));
    config.forActor(actor(11, 'bear'));
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /unknown species "unicorn"/);
  } finally {
    console.warn = original;
  }
});

test('reset clears runtime overrides and cache version', () => {
  const config = createBehaviorConfig();
  const bear = actor(1);
  config.setModuleEnabled('hive', false);
  assert.equal(config.forActor(bear).hive, null);
  const version = config.getVersion();
  config.reset();
  assert.ok(config.getVersion() > version);
  assert.ok(config.forActor(bear).hive);
});

test('the facade keeps legacy as the default engine', () => {
  assert.equal(behaviorEngineFromSearch(''), 'legacy');
  assert.equal(behaviorEngineFromSearch('?autostart=1'), 'legacy');
  assert.equal(behaviorEngineFromSearch('?behaviors=modules'), 'modules');
  assert.equal(behaviorEngineFromSearch('?behaviors=unknown'), 'legacy');
});
