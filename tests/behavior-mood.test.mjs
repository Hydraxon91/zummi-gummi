import test from 'node:test';
import assert from 'node:assert/strict';
import { moodFor, moodLabel, applyMoodOffsets, MOOD_BUCKET } from '../src/behaviors/mood.js';
import { createBehaviorConfig, FEATURE_DEFAULTS } from '../src/behaviors/config.js';
import { snapshotActor } from '../src/actorrecord.js';
import { createBehavior } from '../src/behaviors/index.js';
import { createWorld, createRoster } from '../scripts/behavior-parity.mjs';
import { BEAR_PROFILE, GUMMY_PROFILE, GLASS_PROFILE } from '../src/behaviorprofiles.js';

const PROFILES = { bear: BEAR_PROFILE, gummy: GUMMY_PROFILE, glass: GLASS_PROFILE };
const actor = (race, extra = {}) => ({
  uid: race === 'gummy' ? 2 : 1,
  species: race === 'gummy' ? 'msn' : race,
  kind: race === 'glass' ? 'glass' : 'bear',
  hunger: .3, thirst: .3, energy: 1, health: 100, social: .3, affection: .25,
  bonds: {}, history: [], ai: {},
  traits: { bold: .5, greed: .5, curiosity: .5 },
  ...extra,
});
const moodActor = (mood) => actor('bear', { ai: { mood, moodBucket: mood, moodAt: 1 } });

test('mood is off by default and labels are ordered', () => {
  assert.equal(FEATURE_DEFAULTS.mood, false);
  assert.equal(moodLabel(-.8).key, 'miserable');
  assert.equal(moodLabel(-.2).key, 'low');
  assert.equal(moodLabel(0).key, 'settled');
  assert.equal(moodLabel(.3).key, 'content');
  assert.equal(moodLabel(.8).key, 'cheerful');
});

test('moodFor is pure, bounded and uses existing history kinds only', () => {
  const a = actor('bear');
  const before = JSON.stringify(a);
  const target = moodFor(a, { day: 2, hours: 12 });
  assert.ok(target >= -1 && target <= 1);
  assert.equal(JSON.stringify(a), before, 'moodFor must not mutate');
  const oldKinds = actor('bear', { history: [
    { kind: 'conflict', uid: 2, day: 2, hour: 11 },
    { kind: 'sting', uid: 2, day: 2, hour: 11 },
  ] });
  assert.equal(moodFor(oldKinds, { day: 2, hours: 12 }), moodFor(actor('bear'), { day: 2, hours: 12 }));
  const meal = actor('bear', { history: [{ kind: 'meal', uid: 2, day: 2, hour: 11 }] });
  assert.ok(moodFor(meal, { day: 2, hours: 12 }) > moodFor(actor('bear'), { day: 2, hours: 12 }));
});

test('neutral mood is an exact no-op for every race', () => {
  for (const race of Object.keys(PROFILES)) {
    const base = PROFILES[race];
    assert.deepEqual(applyMoodOffsets(base, 0), base);
  }
});

test('mood offsets stay inside their clamps at ±1', () => {
  for (const race of Object.keys(PROFILES)) {
    for (const mood of [-1, 1]) {
      const out = applyMoodOffsets(PROFILES[race], mood);
      assert.ok(out.wander.longChance >= 0 && out.wander.longChance <= .60);
      assert.ok(out.wander.min >= 2 && out.wander.min <= 6);
      assert.ok(out.wander.max >= 8 && out.wander.max <= 18);
      assert.ok(out.social.cooldown >= 10 && out.social.cooldown <= 18);
      assert.ok(out.thresholds.seekSocial >= .52 && out.thresholds.seekSocial <= .70);
      assert.ok(out.food.searchRadius >= 36 && out.food.searchRadius <= 54);
      if (out.stargaze) assert.ok(out.stargaze.chance >= .02 && out.stargaze.chance <= .25);
      if (race === 'glass') assert.equal(out.wander.longChance, 0);
    }
  }
});

test('trait then mood stacking respects the same clamps and neutral mood is exact', () => {
  const config = createBehaviorConfig({ features: { personality: true, mood: true } });
  for (const race of Object.keys(PROFILES)) {
    const traits = { bold: 1, greed: 1, curiosity: 1 };
    const neutral = config.forActor(actor(race, { traits, ai: { mood: 0, moodBucket: 0 } }));
    const traitOnly = createBehaviorConfig({ features: { personality: true } })
      .forActor(actor(race, { traits, ai: {} }));
    assert.deepEqual(neutral, traitOnly, `${race}: neutral mood must not change trait profile`);
    for (const mood of [-1, 1]) {
      const stacked = config.forActor(actor(race, { traits, ai: { mood, moodBucket: mood } }));
      assert.ok(stacked.wander.longChance <= .60);
      assert.ok(stacked.wander.max <= 18);
      assert.ok(stacked.social.cooldown >= 10 && stacked.social.cooldown <= 18);
      assert.ok(stacked.thresholds.seekSocial >= .52 && stacked.thresholds.seekSocial <= .70);
      assert.ok(stacked.food.searchRadius >= 36 && stacked.food.searchRadius <= 54);
    }
  }
});

test('mood off ignores ai.mood and leaves the profile untouched', () => {
  const config = createBehaviorConfig({ features: { personality: true, mood: false } });
  const a = actor('bear', { traits: { bold: 1, greed: 1, curiosity: 1 }, ai: { mood: -1, moodBucket: -1 } });
  const noMood = createBehaviorConfig({ features: { personality: true } })
    .forActor(actor('bear', { traits: a.traits, ai: {} }));
  assert.deepEqual(config.forActor(a), noMood);
});

test('mood cache invalidation count is explicit and bucket-based', () => {
  const config = createBehaviorConfig({ features: { mood: true } });
  const a = moodActor(0);
  config.forActor(a);
  const before = config.getInvalidations();
  a.ai.mood = .42;
  a.ai.moodBucket = Math.round(.42 / MOOD_BUCKET) * MOOD_BUCKET;
  config.invalidateActor(a);
  assert.equal(config.getInvalidations(), before + 1);
  assert.equal(config.forActor(a).mood > 0, true);
});

function moodEngineRun(on, baseline = false) {
  const world = createWorld();
  const roster = createRoster('bear');
  for (const a of roster) {
    a.social = .55;
    a.affection = .55;
  }
  let draws = 0;
  const rng = () => { draws++; return .5; };
  const config = baseline ? null : createBehaviorConfig({ features: { mood: on } });
  const engine = createBehavior({
    engine: 'modules', config, field: world, getActors: () => roster,
    getHours: () => 12, getDay: () => 1, getPopulationCap: () => 40, rng,
  });
  const warn = console.warn;
  console.warn = () => {};
  try {
    for (const a of roster) engine.attach(a);
    // Four ticks stay below the first mood update interval, so neutral mood
    // must leave the off-path state and RNG draw count identical.
    for (let tick = 0; tick < 4; tick++) {
      for (const a of roster) engine.tick(a, 1 / 20);
    }
  } finally {
    console.warn = warn;
  }
  return {
    draws,
    state: JSON.stringify(roster.map(a => [a.uid, a.ai?.state, a.hunger, a.thirst,
      a.health, a.energy, a.social, a.affection, a.cx, a.cz])),
    mood: roster.map(a => a.ai?.mood),
  };
}

test('mood off matches the no-config baseline; neutral mood on matches too', () => {
  const baseline = moodEngineRun(false, true);
  const off = moodEngineRun(false);
  const on = moodEngineRun(true);
  assert.equal(off.draws, baseline.draws);
  assert.equal(off.state, baseline.state);
  assert.equal(on.draws, off.draws);
  assert.equal(on.state, off.state);
  assert.ok(on.mood.every(value => Math.abs(value) < 1e-9));
});

test('mood is rebuilt at zero after detach/reattach (load or map switch)', () => {
  const world = createWorld();
  const roster = [{
    uid: 1, active: true, species: 'bear', kind: 'bear', name: 'Pip',
    cx: 0, cz: 0, cy: 1, sex: 'F', stage: 'adult', age: 700, home: 'Home 1',
    hunger: .3, thirst: .3, energy: 1, health: 100, social: .3, affection: .25,
    bonds: {}, skills: {}, history: [], playdates: {}, parentUids: [],
  }];
  const config = createBehaviorConfig({ features: { mood: true } });
  const engine = createBehavior({
    engine: 'modules', config, field: world, getActors: () => roster,
    getHours: () => 12, getDay: () => 1, getPopulationCap: () => 40, rng: () => .5,
  });
  engine.attach(roster[0]);
  roster[0].ai.mood = .8;
  roster[0].ai.moodBucket = .8;
  engine.detach(roster[0]);
  engine.attach(roster[0]);
  assert.equal(roster[0].ai.mood, 0);
  assert.equal(roster[0].ai.moodBucket, 0);
});

test('actor snapshots contain no mood fields', () => {
  const a = actor('bear', {
    ai: { mood: -.8, moodAt: 12.5, moodBucket: -.8 },
    ...{
      active: true, name: 'Pip', sex: 'F', stage: 'adult', age: 700, scale: 1,
      bonds: {}, skills: {}, playdates: {}, home: 'Home 1', pregnant: false,
      gestation: 0, mateCooldown: 0, fatherUid: 0, parentUids: [],
      genome: { version: 1 }, cx: 1, cz: 2,
    },
  });
  const record = snapshotActor(a);
  const json = JSON.stringify(record);
  assert.equal(json.includes('mood'), false);
  assert.equal(json.includes('moodAt'), false);
});
