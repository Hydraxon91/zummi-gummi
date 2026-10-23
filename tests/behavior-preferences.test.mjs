import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ACTIVITY_DISPOSITIONS, validActivityValues, normalizePreferences, normalizeHabits,
  reinforceHabit, decayHabits, applyActivityOffsets,
} from '../src/behaviors/preferences.js';
import { createBehaviorConfig, FEATURE_DEFAULTS } from '../src/behaviors/config.js';
import { createBehavior } from '../src/behaviors/index.js';
import { createWorld, createRoster, mulberry32 } from '../scripts/behavior-parity.mjs';
import { snapshotActor, applyCommonActorState } from '../src/actorrecord.js';
import { migrateActorRecord, validateActorWorld } from '../src/actorsave.js';

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-10, `${a} != ${b}`);
const flags = { preferences: true, habits: true };

function fixture({ race = 'glass', preference = .5, habit = 0, features = flags, random = () => .12 } = {}) {
  const actor = createRoster(race)[0];
  const roster = [actor];
  let hours = 20, draws = 0;
  const config = createBehaviorConfig({ features });
  const engine = createBehavior({
    engine: 'modules', config, field: createWorld(), getActors: () => roster,
    getHours: () => hours, getDay: () => 1, getPopulationCap: () => 40,
    daySeconds: 600, rng: () => { draws++; return random(); },
  });
  engine.attach(actor);
  config.setPreference(actor, 'stargaze', preference);
  if (habit) actor.habits = { stargaze: habit };
  const opportunity = () => engine.api.runOpportunity(actor, 'stargaze.seek');
  return { actor, roster, engine, config, opportunity,
    hours(value) { hours = value; }, draws: () => draws };
}

test('portable definitions, strict input validation and sparse normalization', () => {
  assert.equal(FEATURE_DEFAULTS.preferences, false);
  assert.equal(FEATURE_DEFAULTS.habits, false);
  assert.equal(Object.isFrozen(ACTIVITY_DISPOSITIONS[0]), true);
  for (const value of [null, [], { bad: .5 }, { stargaze: NaN }, { stargaze: 2 }, { stargaze: '1' }]) {
    assert.equal(validActivityValues(value), false);
  }
  assert.equal(validActivityValues({ stargaze: 1 }), true);
  assert.deepEqual(normalizePreferences({ stargaze: .5, unknown: 1 }), {});
  assert.deepEqual(normalizeHabits({ stargaze: 0 }), {});
  const source = { stargaze: .9 };
  assert.deepEqual(reinforceHabit(source, 'stargaze'), { stargaze: 1 });
  near(decayHabits(source, 1).stargaze, .85);
  assert.deepEqual(source, { stargaze: .9 });
  assert.deepEqual(decayHabits(source, 30), {});
  assert.deepEqual(reinforceHabit({}, 'unknown'), {});
});

test('translation fixtures: sparse records, saturation and fractional-day decay', () => {
  const sparse = [
    { input: null, expected: {} },
    { input: { stargaze: .5 }, expected: {} },
    { input: { stargaze: .75, unknown: 1 }, expected: { stargaze: .75 } },
    { input: { stargaze: 0 }, expected: { stargaze: 0 } },
    { input: { stargaze: 2 }, expected: { stargaze: 1 } },
  ];
  for (const { input, expected } of sparse) {
    assert.deepEqual(normalizePreferences(input), expected);
  }
  const habitSource = { stargaze: .92 };
  assert.deepEqual(reinforceHabit(habitSource, 'stargaze'), { stargaze: 1 });
  assert.deepEqual(reinforceHabit({ stargaze: 1 }, 'stargaze'), { stargaze: 1 });
  assert.deepEqual(habitSource, { stargaze: .92 }, 'reinforcement must not mutate its input');
  const decaySource = { stargaze: .43 };
  const decayed = decayHabits(decaySource, 3);
  near(decayed.stargaze, .28);
  assert.deepEqual(decaySource, { stargaze: .43 }, 'decay must not mutate its input');
  const fractionalSource = { stargaze: .43 };
  const fractional = decayHabits(fractionalSource, 1.5);
  near(fractional.stargaze, .355);
  assert.deepEqual(fractionalSource, { stargaze: .43 },
    'fractional decay must not mutate its input');
});

test('approved translation fixtures: liking and habit effects stack after traits/mood', () => {
  for (const [preference, habit, chance] of [[0, 0, .06], [.5, 0, .10], [1, 0, .14], [1, 1, .16]]) {
    const f = fixture({ preference, habit });
    assert.equal(f.config.forActor(f.actor).stargaze.chance, chance);
    assert.equal(f.config.forActor(f.actor).behaviorModules.stargaze.params.chance, chance);
  }
  for (const race of ['bear', 'gummy']) {
    const f = fixture({ race, preference: 1, habit: 1 });
    assert.equal(f.config.forActor(f.actor).stargaze, null);
    assert.equal(f.opportunity(), null, 'a liking must not grant an unsupported activity');
  }
  const neutral = fixture();
  const profile = neutral.config.forActor(neutral.actor);
  assert.equal(applyActivityOffsets(profile, {}, {}, flags), profile);
  const stacked = fixture({ preference: 1, habit: 1, features: { ...flags, personality: true, mood: true } });
  stacked.actor.traits = { bold: .5, greed: .5, curiosity: 1 };
  stacked.actor.ai.moodBucket = 1;
  stacked.config.invalidateActor(stacked.actor);
  assert.ok(stacked.config.forActor(stacked.actor).stargaze.chance <= .25);
});

test('cache tracks effects, rejects malformed setters, and ignores off-layer data', () => {
  const f = fixture({ habit: .5 });
  const first = f.config.forActor(f.actor);
  f.actor.habits.stargaze -= .00001;
  assert.equal(f.config.forActor(f.actor), first, 'sub-resolution decay retains cache');
  f.actor.habits.stargaze = .4;
  assert.notEqual(f.config.forActor(f.actor), first);
  assert.equal(f.engine.setPreference(f.actor, 'missing', 1), false);
  assert.equal(f.engine.setPreference(f.actor, 'stargaze', NaN), false);
  assert.equal(f.engine.setPreference(f.actor, 'stargaze', 1), true);
  assert.equal(f.engine.dispositions(f.actor).stargazeChance, .148);
  f.engine.setFeature('preferences', false);
  f.engine.setFeature('habits', false);
  const off = f.config.forActor(f.actor);
  f.actor.habits.stargaze = 1;
  assert.equal(f.config.forActor(f.actor), off);
  assert.equal(off.stargaze.chance, .1);
});

test('real opportunity differentiates preferences using identical existing RNG draws', () => {
  const likes = fixture({ preference: 1 });
  const dislikes = fixture({ preference: 0 });
  const beforeLikes = likes.draws(), beforeDislikes = dislikes.draws();
  assert.equal(likes.opportunity().id, 'stargaze.seek');
  assert.equal(dislikes.opportunity(), null);
  assert.equal(likes.draws() - beforeLikes, 2, 'selection + existing duration draw');
  assert.equal(dislikes.draws() - beforeDislikes, 1, 'existing rejected selection draw');
  dislikes.hours(12);
  const before = dislikes.draws();
  assert.equal(dislikes.opportunity(), null);
  assert.equal(dislikes.draws(), before, 'closed window draws no RNG');
});

test('natural ordered selection reaches stargazing without forced entry; survival still wins', () => {
  const likes = fixture({ preference: 1 });
  const dislikes = fixture({ preference: 0 });
  likes.engine.tick(likes.actor, 1);
  dislikes.engine.tick(dislikes.actor, 1);
  assert.equal(likes.actor.ai.state, 'stargaze');
  assert.equal(dislikes.actor.ai.state, 'wander');
  assert.equal(likes.engine.coverage().opportunities['stargaze.seek'], 1);
  const thirsty = fixture({ preference: 1, habit: 1 });
  thirsty.actor.thirst = 1;
  thirsty.engine.tick(thirsty.actor, 1);
  assert.notEqual(thirsty.actor.ai.state, 'stargaze');
  assert.equal(thirsty.engine.coverage().opportunities['stargaze.seek'], undefined);
});

test('completed session learns once; timed decay uses active dt, not wall/day jumps', () => {
  const f = fixture({ preference: 1 });
  f.opportunity();
  f.engine.tick(f.actor, 10);
  assert.equal(f.actor.ai.state, 'wander');
  near(f.actor.habits.stargaze, .1);
  f.actor.ai.possessed = true; // Avoid another opportunity while exercising decay.
  f.engine.tick(f.actor, 60);
  near(f.actor.habits.stargaze, .095);
  f.actor.active = false;
  f.engine.tick(f.actor, 600);
  near(f.actor.habits.stargaze, .095);
  f.actor.active = true;
  f.engine.setEnabled(false);
  f.engine.tick(f.actor, 600);
  near(f.actor.habits.stargaze, .095);
  f.engine.setEnabled(true);
  f.engine.tick(f.actor, 60);
  near(f.actor.habits.stargaze, .09);
});

test('need exits, critical needs, grab, detach and disable never reward an interrupted session', () => {
  for (const interrupt of [
    f => { f.actor.hunger = .86; },
    f => { f.actor.thirst = 1; },
    f => f.engine.onGrab(f.actor),
    f => f.engine.interruptActor(f.actor, 'test'),
    f => { f.engine.detach(f.actor); f.engine.attach(f.actor); },
    f => { f.engine.setFeature('habits', false); f.engine.setFeature('habits', true); },
    f => { f.engine.setEnabled(false); f.engine.setEnabled(true); },
  ]) {
    const f = fixture({ preference: 1 });
    f.opportunity();
    interrupt(f);
    f.actor.ai.nextThink = Infinity; // Do not admit a new session after detach/reattach.
    f.engine.tick(f.actor, 10);
    assert.equal(f.actor.habits, undefined);
    assert.equal(f.actor.ai.stargazeLearning, undefined);
  }
});

test('disabling habits freezes state and drops only the in-progress learning token', () => {
  const f = fixture({ preference: 1, habit: .4 });
  f.opportunity();
  f.engine.setFeature('habits', false);
  f.engine.tick(f.actor, 10);
  assert.deepEqual(f.actor.habits, { stargaze: .4 });
  assert.equal(f.engine.dispositions(f.actor).stargazeChance, .14);
  f.engine.setFeature('habits', true);
  assert.equal(f.engine.dispositions(f.actor).stargazeChance, .148);
});

test('a new session after grab/release learns despite the historical interruption flag', () => {
  const f = fixture({ preference: 1 });
  f.opportunity();
  f.engine.onGrab(f.actor);
  assert.equal(f.actor.ai.stargazeLearning, undefined);
  f.engine.tick(f.actor, 10);
  assert.equal(f.actor.habits, undefined, 'interrupted session earns nothing');
  f.engine.onRelease(f.actor);
  assert.equal(f.actor.ai.interrupted, true, 'historical host flag is not a session token');
  f.engine.tick(f.actor, 1);
  assert.equal(f.actor.ai.state, 'stargaze', 'new session is selected naturally');
  f.engine.tick(f.actor, 10);
  near(f.actor.habits.stargaze, .1);
});

function trace(seed, features, withData) {
  const rng = mulberry32(seed);
  const f = fixture({ features, random: rng });
  if (withData) {
    f.actor.preferences = { stargaze: 1 };
    f.actor.habits = { stargaze: .5 };
  }
  const out = [];
  for (let i = 0; i < 1000; i++) {
    // Real ordered decision loop, not forced state entries.
    f.engine.tick(f.actor, .1);
    // Headless movement stand-in: finish the destination selected by the engine
    // so an actor without a physics adapter can reach subsequent opportunities.
    if (f.actor.ai.moving && f.actor.ai.target) {
      f.actor.cx = f.actor.ai.target.x;
      f.actor.cz = f.actor.ai.target.z;
      f.actor.ai.moving = false;
      f.actor.ai.arrived = true;
      f.actor.ai.target = null;
    }
    out.push([f.actor.ai.state, f.actor.ai.idleT, f.actor.hunger, f.actor.habits?.stargaze, f.draws()]);
  }
  return { out, draws: f.draws(), coverage: f.engine.coverage() };
}

test('enabled traces/RNG reproduce; disabled state does not change decisions or draws', () => {
  const enabled = trace(7, flags, true);
  assert.deepEqual(enabled, trace(7, flags, true));
  assert.ok(enabled.coverage.opportunities['stargaze.seek'] > 0, 'enabled trace exercises the activity');
  const withData = trace(7, {}, true), withoutData = trace(7, {}, false);
  assert.equal(withData.draws, withoutData.draws);
  assert.deepEqual(withData.out.map(row => row.slice(0, 3)), withoutData.out.map(row => row.slice(0, 3)));
  assert.deepEqual(withData.coverage, withoutData.coverage);
});

test('v9 round-trips both representations, clones state, and leaves old records unchanged', () => {
  for (const race of ['bear', 'gummy', 'glass']) {
    const a = createRoster(race)[0];
    a.preferences = { stargaze: 1 };
    a.habits = { stargaze: .45 };
    a.lastGiftDay = 1;
    a.partnerUid = 2;
    const record = snapshotActor(a, { flavor: 0 });
    assert.equal(record.actorVersion, 9);
    const errors = [];
    validateActorWorld({ bears: race === 'glass' ? [] : [record], glass: race === 'glass' ? [record] : [] }, 'world', errors);
    assert.deepEqual(errors, []);
    const restored = createRoster(race)[0];
    applyCommonActorState(restored, migrateActorRecord(record));
    assert.deepEqual(restored.preferences, a.preferences);
    assert.deepEqual(restored.habits, a.habits);
    restored.habits.stargaze = 1;
    assert.equal(a.habits.stargaze, .45);
    const old = { actorVersion: 2, uid: 9, x: 1, z: 1, flavor: 0, stage: 'adult' };
    applyCommonActorState(restored, migrateActorRecord(old));
    assert.equal(restored.preferences, undefined);
    assert.equal(restored.habits, undefined);
    assert.equal(migrateActorRecord(old).actorVersion, 2);
  }
});

test('v9 validation rejects bad fields and older versions carrying new state', () => {
  const base = { actorVersion: 9, uid: 1, x: 0, z: 0, flavor: 0, stage: 'adult' };
  for (const patch of [{}, { preferences: { stargaze: Infinity } }, { habits: { unknown: 1 } },
    { preferences: [] }, { actorVersion: 8, habits: { stargaze: .4 } }]) {
    const errors = [];
    validateActorWorld({ bears: [{ ...base, ...patch }] }, 'world', errors);
    assert.ok(errors.length, JSON.stringify(patch));
  }
});

test('v9 coexists with earlier optional fields; trait inheritance/save contracts stay intact', () => {
  const a = createRoster('bear')[0];
  Object.assign(a, {
    stage: 'baby', guardianUid: 3, preferences: { stargaze: .2 }, habits: { stargaze: .3 },
    traits: { bold: .2, greed: .8, curiosity: .4 }, lastGiftDay: 2,
    mourning: [{ uid: 4, cause: 'stars', day: 1, hours: 6, untilDay: 2,
      duration: 1, closeness: .5, lastComfortDay: null }],
    history: [{ kind: 'social', uid: 2, day: 1, hour: 8, bondBefore: .4, bondAfter: .52 }],
  });
  const record = snapshotActor(a, { flavor: 0 });
  const errors = [];
  validateActorWorld({ bears: [record] }, 'world', errors);
  assert.deepEqual(errors, []);
  const migrated = migrateActorRecord(record);
  assert.equal(migrated.actorVersion, 9);
  assert.deepEqual(migrated.traits, a.traits);
  assert.equal(migrated.guardianUid, 3);
  assert.equal(migrated.mourning.length, 1);
  assert.equal(migrated.history[0].bondAfter, .52);
  assert.equal(migrated.lastGiftDay, 2);
});
