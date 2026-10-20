import test from 'node:test';
import assert from 'node:assert/strict';
import {
  founderTraits, normalizeTraits, ensureTraits, applyTraitOffsets, TRAIT_AXES,
} from '../src/behaviors/traits.js';
import { blendTraits, blendPace, inheritedFlavor } from '../src/life.js';
import { createBehaviorConfig, FEATURE_DEFAULTS } from '../src/behaviors/config.js';
import { createBehavior } from '../src/behaviors/index.js';
import { BEAR_PROFILE, GUMMY_PROFILE, GLASS_PROFILE } from '../src/behaviorprofiles.js';
import { createWorld, createRoster } from '../scripts/behavior-parity.mjs';

const PROFILES = { bear: BEAR_PROFILE, gummy: GUMMY_PROFILE, glass: GLASS_PROFILE };
const actor = (race, traits) => ({
  uid: race === 'glass' ? 9 : 1,
  species: race === 'gummy' ? 'msn' : race,
  kind: race === 'glass' ? 'glass' : 'bear',
  traits,
});
const neutral = () => ({ bold: .5, greed: .5, curiosity: .5 });

function seeded(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test('personality is off by default', () => {
  assert.equal(FEATURE_DEFAULTS.personality, false);
});

test('founder traits are deterministic, bounded and RNG-free', () => {
  for (const race of ['bear', 'gummy', 'glass']) {
    const one = founderTraits(7, race === 'gummy' ? 'msn' : race);
    const two = founderTraits(7, race === 'gummy' ? 'msn' : race);
    assert.deepEqual(one, two);
    for (const axis of TRAIT_AXES) {
      assert.ok(one[axis] >= .15 && one[axis] <= .85, `${race}.${axis}`);
    }
  }
  const quiet = actor('bear', null);
  assert.equal(ensureTraits(quiet), true);
  assert.deepEqual(quiet.traits, founderTraits(quiet.uid, quiet.species));
  assert.equal(ensureTraits(quiet), false);
});

test('neutral trait deltas preserve exact profile values for all races', () => {
  for (const [race, base] of Object.entries(PROFILES)) {
    const config = createBehaviorConfig({ features: { personality: true } });
    const resolved = config.forActor(actor(race, neutral()));
    assert.deepEqual(resolved.wander, base.wander, `${race}.wander`);
    assert.deepEqual(resolved.thresholds, base.thresholds, `${race}.thresholds`);
    assert.deepEqual(resolved.social, base.social, `${race}.social`);
    assert.deepEqual(resolved.food, base.food, `${race}.food`);
    assert.deepEqual(resolved.mate, base.mate, `${race}.mate`);
    if (base.hive) assert.deepEqual(resolved.hive, base.hive, `${race}.hive`);
    if (base.stargaze) assert.deepEqual(resolved.stargaze, base.stargaze, `${race}.stargaze`);
    assert.equal(resolved.traits, undefined, `${race} neutral should not add traits metadata`);
  }
});

test('long-wander offsets stay off for Glass and apply for Bear/Gummy', () => {
  for (const race of ['bear', 'gummy']) {
    const base = PROFILES[race];
    const config = createBehaviorConfig({ features: { personality: true } });
    const bold = config.forActor(actor(race, { ...neutral(), bold: 1, curiosity: 1 }));
    const shy = config.forActor(actor(race, { ...neutral(), bold: 0, curiosity: 0 }));
    assert.ok(bold.wander.longChance > base.wander.longChance, `${race} bold longChance`);
    assert.ok(shy.wander.longChance < base.wander.longChance, `${race} shy longChance`);
  }
  const glass = GLASS_PROFILE;
  const config = createBehaviorConfig({ features: { personality: true } });
  for (const traits of [{ ...neutral(), bold: 1, curiosity: 1 }, { ...neutral(), bold: 0, curiosity: 0 }]) {
    assert.equal(config.forActor(actor('glass', traits)).wander.longChance, glass.wander.longChance);
  }
  const curious = config.forActor(actor('glass', { ...neutral(), curiosity: 1 }));
  const homebody = config.forActor(actor('glass', { ...neutral(), curiosity: 0 }));
  assert.ok(curious.wander.max - homebody.wander.max >= 6,
    'Glass curiosity must widen the short-wander span materially');
});

test('threshold ordering holds across all trait extremes', () => {
  const config = createBehaviorConfig({ features: { personality: true } });
  for (const race of Object.keys(PROFILES)) {
    for (const bold of [0, 1]) {
      for (const greed of [0, 1]) {
        for (const curiosity of [0, 1]) {
          const p = config.forActor(actor(race, { bold, greed, curiosity }));
          assert.ok(p.thresholds.seekHunger > p.thresholds.stopHunger,
            `${race} greed=${greed} seekHunger > stopHunger`);
          assert.ok(p.thresholds.seekSocial > p.thresholds.stopSocial,
            `${race} bold=${bold} seekSocial > stopSocial`);
          if (race === 'glass') assert.equal(p.wander.longChance, 0, 'Glass never enables long wanders');
        }
      }
    }
  }
});

test('blendTraits draws after the existing flavor/pace/sex birth draws', () => {
  let draws = 0;
  const rng = () => { draws++; return .5; };
  inheritedFlavor(2, 6, rng);
  blendPace({ hopSpeedMin: .8, hopSpeedMax: 1.6 }, { hopSpeedMin: .8, hopSpeedMax: 1.6 }, rng);
  const sexDraw = rng();
  const beforeTraits = draws;
  blendTraits({ bold: .5, greed: .5, curiosity: .5 }, { bold: .5, greed: .5, curiosity: .5 }, rng);
  assert.equal(sexDraw, .5);
  assert.equal(draws - beforeTraits, 3);
});

test('blendTraits draws exactly once per axis and clamps', () => {
  let draws = 0;
  const rng = () => { draws++; return draws === 1 ? 0 : 1; };
  const out = blendTraits({ bold: .5, greed: .5, curiosity: .5 }, { bold: .5, greed: .5, curiosity: .5 }, rng);
  assert.equal(draws, 3);
  for (const axis of TRAIT_AXES) assert.ok(out[axis] >= .02 && out[axis] <= .98);
});

test('actor config cache invalidates after a trait change', () => {
  const config = createBehaviorConfig({ features: { personality: true } });
  const a = actor('bear', neutral());
  const first = config.forActor(a);
  a.traits = { bold: .5, greed: 1, curiosity: .5 };
  assert.equal(config.forActor(a), first, 'cached until invalidated');
  assert.equal(config.invalidateActor(a), true);
  const changed = config.forActor(a);
  assert.notEqual(changed, first);
  assert.ok(changed.thresholds.stopHunger > first.thresholds.stopHunger);
});

test('ensureTraits during attach invalidates the cached actor config', () => {
  const config = createBehaviorConfig({ features: { personality: true } });
  const a = { uid: 4, species: 'bear', kind: 'bear', hunger: .3, thirst: .3, traits: neutral() };
  const before = config.forActor(a);
  delete a.traits;
  const engine = createBehavior({
    engine: 'modules', config, field: createWorld(), getActors: () => [a],
    getHours: () => 12, getDay: () => 1, getPopulationCap: () => 40, rng: () => .5,
  });
  engine.attach(a);
  assert.ok(a.traits);
  const after = config.forActor(a);
  assert.notEqual(after, before);
  assert.deepEqual(after.traits, a.traits);
});

test('personality off leaves profile and attach behavior untouched', () => {
  const config = createBehaviorConfig();
  const a = actor('bear', { bold: 1, greed: 1, curiosity: 1 });
  const resolved = config.forActor(a);
  assert.deepEqual(resolved.wander, BEAR_PROFILE.wander);
  assert.deepEqual(resolved.thresholds, BEAR_PROFILE.thresholds);
  assert.equal(resolved.traits, undefined);

  const plain = { uid: 1, species: 'bear', kind: 'bear', hunger: .3, thirst: .3 };
  const offEngine = createBehavior({ engine: 'modules', config, field: {}, getActors: () => [],
    getHours: () => 12, getDay: () => 1, getPopulationCap: () => 40, rng: () => .5 });
  offEngine.attach(plain);
  assert.equal(plain.traits, undefined, 'feature-off attach must not hash traits');
});

function runFeature(personality, baseline = false) {
  const world = createWorld();
  const roster = createRoster('bear');
  if (!baseline) for (const a of roster) a.traits = neutral();
  const rng = seeded(29);
  let draws = 0;
  const config = baseline ? null : createBehaviorConfig({ features: { personality } });
  const engine = createBehavior({
    engine: 'modules', config, field: world, getActors: () => roster,
    getHours: () => 12, getDay: () => 1, getPopulationCap: () => 40,
    rng: () => { draws++; return rng(); },
  });
  const warn = console.warn;
  console.warn = () => {};
  try {
    for (const a of roster) engine.attach(a);
    for (let tick = 0; tick < 120; tick++) {
      for (const a of roster) engine.tick(a, 1 / 20);
    }
  } finally {
    console.warn = warn;
  }
  return {
    draws,
    state: JSON.stringify(roster.map(a => [a.uid, a.ai?.state, a.hunger, a.thirst, a.health,
      a.energy, a.social, a.affection, a.cx, a.cz])),
  };
}

test('personality off draws exactly like the no-config baseline', () => {
  const baseline = runFeature(false, true);
  const off = runFeature(false);
  assert.equal(off.draws, baseline.draws);
  assert.equal(off.state, baseline.state);
});

test('personality off/on with neutral traits draws and simulates identically', () => {
  const off = runFeature(false);
  const on = runFeature(true);
  assert.equal(on.draws, off.draws);
  assert.equal(on.state, off.state);
});
