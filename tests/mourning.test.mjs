import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addMourning, comfortMourning, mourningDuration, mourningLabel, mourningMood,
  mourningOverlap, normalizeMourning, pruneMourning, MOURNING_DEFAULTS,
} from '../src/behaviors/mourning.js';
import { moodFor } from '../src/behaviors/mood.js';
import { FEATURE_DEFAULTS } from '../src/behaviors/config.js';
import { snapshotActor, applyCommonActorState } from '../src/actorrecord.js';
import { migrateActorRecord, validateActorWorld } from '../src/actorsave.js';

function actor(uid, extra = {}) {
  return {
    uid, active: true, species: 'bear', kind: 'bear', name: `actor-${uid}`,
    stage: 'adult', age: 700, scale: 1, sex: 'F', flavor: 0,
    health: 100, hunger: .3, thirst: .3, energy: 1, social: .5, affection: .3,
    bonds: {}, skills: {}, history: [], playdates: {}, parentUids: [], home: 'Home 1',
    ...extra,
  };
}

test('mourning is off by default and requires a family tie or a real bond', () => {
  assert.equal(FEATURE_DEFAULTS.mourning, false);
  const friend = actor(1, { bonds: { 2: .5 } });
  const distant = actor(3, { bonds: { 2: .02 } });
  const departed = actor(2);
  assert.ok(mourningOverlap(friend, departed));
  assert.equal(mourningOverlap(distant, departed), null);
  assert.equal(addMourning(distant, departed, { day: 1 }), false);
});

test('family grief uses a floor while close bonds last longer', () => {
  const departed = actor(2);
  const family = actor(3, { parentUids: [2] });
  const close = actor(4, { bonds: { 2: .9 } });
  const weak = actor(5, { bonds: { 2: .2 } });
  assert.ok(mourningOverlap(family, departed));
  assert.ok(mourningDuration(.9) > mourningDuration(.2));
  assert.ok(mourningDuration(.2) >= MOURNING_DEFAULTS.minDays);
  assert.ok(mourningDuration(1) <= MOURNING_DEFAULTS.maxDays);
  assert.equal(addMourning(weak, departed, { day: 1 }), true);
  assert.equal(weak.mourning[0].uid, 2);
});

test('grief fades with simulated days and is pruned after its deadline', () => {
  const survivor = actor(1, { bonds: { 2: .8 } });
  addMourning(survivor, actor(2), { day: 4, hours: 12 });
  const start = mourningMood(survivor, { day: 4, hours: 12 });
  const later = mourningMood(survivor, { day: 7, hours: 12 });
  assert.ok(start > later && later > 0);
  assert.ok(start <= MOURNING_DEFAULTS.moodWeight);
  assert.equal(moodFor(survivor, { day: 4, hours: 12 }) < moodFor(actor(9), { day: 4, hours: 12 }), true);
  const withoutMourning = actor(1, { bonds: { 2: .8 } });
  assert.equal(moodFor(survivor, { day: 4, hours: 12, mourning: false }),
    moodFor(withoutMourning, { day: 4, hours: 12 }));
  pruneMourning(survivor, 30, 0);
  assert.equal(survivor.mourning, undefined);
  assert.equal(mourningMood(survivor, { day: 30 }), 0);
});

test('comfort eases grief at most once per game day and needs a close comforter', () => {
  const survivor = actor(1, { bonds: { 2: .8 } });
  addMourning(survivor, actor(2), { day: 4, hours: 12 });
  const until = survivor.mourning[0].untilDay;
  assert.equal(comfortMourning(survivor, actor(6, { bonds: { 1: .1 } }), { day: 4, hours: 13 }), false);
  assert.equal(comfortMourning(survivor, actor(6, { bonds: { 1: .8 } }), { day: 4, hours: 13 }), true);
  assert.ok(survivor.mourning[0].untilDay < until);
  assert.equal(comfortMourning(survivor, actor(6, { bonds: { 1: .8 } }), { day: 4, hours: 20 }), false);
  assert.equal(comfortMourning(survivor, actor(6, { bonds: { 1: .8 } }), { day: 5, hours: 13 }), true);
  assert.match(mourningLabel(survivor, { day: 4, hours: 13 }), /actor-2/);
});

test('a mourning record round-trips through the actor save as v4', () => {
  const survivor = actor(7, { bonds: { 2: .65 } });
  addMourning(survivor, actor(2, { name: 'Bob' }), { day: 8, hours: 12 });
  const record = snapshotActor(survivor, { flavor: 0 });
  assert.equal(record.actorVersion, 4);
  assert.equal(record.mourning.length, 1);
  const errors = [];
  validateActorWorld({ bears: [record] }, 'world', errors);
  assert.deepEqual(errors, []);
  const restored = actor(7);
  applyCommonActorState(restored, record);
  assert.deepEqual(restored.mourning, normalizeMourning(survivor.mourning));
  assert.notEqual(restored.mourning[0].untilDay, undefined);
});

test('a different saved game does not inherit another game’s grief', () => {
  const savedGameOne = actor(1);
  const savedGameTwo = actor(1, { bonds: { 2: .7 } });
  addMourning(savedGameTwo, actor(2), { day: 3 });
  const one = snapshotActor(savedGameOne);
  const two = snapshotActor(savedGameTwo);
  assert.equal(one.actorVersion, 2);
  assert.equal(one.mourning, undefined);
  assert.equal(two.actorVersion, 4);
  const loadedOne = actor(1);
  applyCommonActorState(loadedOne, one);
  assert.equal(loadedOne.mourning, undefined);
  const loadedTwo = actor(1);
  applyCommonActorState(loadedTwo, two);
  assert.equal(loadedTwo.mourning.length, 1);
});

test('v4 migration preserves grief and rejects malformed records', () => {
  const source = actor(1, { bonds: { 2: .7 } });
  addMourning(source, actor(2), { day: 3 });
  const migrated = migrateActorRecord(snapshotActor(source));
  assert.equal(migrated.actorVersion, 4);
  assert.equal(migrated.mourning.length, 1);
  const down = migrateActorRecord({ actorVersion: 4, uid: 1, x: 0, z: 0, stage: 'adult', flavor: 0 });
  assert.equal(down.actorVersion, 2);
  const expired = migrateActorRecord({ ...snapshotActor(source), mourning: [{
    ...source.mourning[0], day: 10, untilDay: 9,
  }] });
  assert.equal(expired.actorVersion, 2);
  assert.equal(expired.mourning, undefined);
  const invalid = [
    { uid: 2, cause: 'stars', day: 1, hours: 25, untilDay: 2, duration: 1, closeness: .5 },
    { uid: 2, cause: 'stars', day: 2, hours: 1, untilDay: 2, duration: 1, closeness: .5 },
    { uid: 2, cause: 'stars', day: 1, hours: 1, untilDay: 2, duration: 0, closeness: .5 },
    { uid: 2, cause: 'stars', day: 1, hours: 1, untilDay: 2, duration: 1, closeness: .5, lastComfortDay: 'x' },
  ];
  for (const record of invalid) {
    const errors = [];
    validateActorWorld({ bears: [{
      actorVersion: 4, uid: 1, x: 0, z: 0, stage: 'adult', flavor: 0, mourning: [record],
    }] }, 'world', errors);
    assert.match(errors.join('; '), /mourning\[0\] is invalid/);
  }
});

test('v4 carries traits and grief together', () => {
  const source = actor(1, { bonds: { 2: .7 }, traits: { bold: .4, greed: .6, curiosity: .5 } });
  addMourning(source, actor(2), { day: 3 });
  const record = snapshotActor(source, { flavor: 0 });
  assert.equal(record.actorVersion, 4);
  assert.deepEqual(record.traits, source.traits);
  const errors = [];
  validateActorWorld({ bears: [record] }, 'world', errors);
  assert.deepEqual(errors, []);
  const restored = actor(1);
  applyCommonActorState(restored, migrateActorRecord(record));
  assert.deepEqual(restored.traits, source.traits);
  assert.equal(restored.mourning.length, 1);
});
