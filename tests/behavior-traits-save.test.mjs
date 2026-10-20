import test from 'node:test';
import assert from 'node:assert/strict';
import { snapshotActor, applyCommonActorState } from '../src/actorrecord.js';
import {
  ACTOR_SAVE_VERSION, validateActorWorld, migrateActorRecord, migrateActorWorld,
} from '../src/actorsave.js';
import { defaultGenome } from '../src/dna.js';
import { ensureTraits, founderTraits } from '../src/behaviors/traits.js';

const TRAITS = { bold: .2, greed: .8, curiosity: .4 };

function actor(overrides = {}) {
  return {
    uid: 21, active: true, kind: 'softbody', species: 'bear', name: 'Pip',
    sex: 'F', stage: 'adult', age: 700, scale: 1, health: 90, hunger: .3,
    thirst: .3, energy: 1, social: .3, affection: .2, bold: .5,
    bonds: {}, skills: {}, history: [], playdates: {}, home: 'Home 1',
    pregnant: false, gestation: 0, mateCooldown: 0, fatherUid: 0,
    parentUids: [], genome: defaultGenome('bear'), cx: 1, cz: 2,
    ...overrides,
  };
}

function saved(overrides = {}) {
  return {
    actorVersion: 2, uid: 21, x: 1, z: 2, flavor: 0, stage: 'adult',
    genome: defaultGenome('bear'), ...overrides,
  };
}

test('trait-free snapshot stays actorVersion 2 with no traits key', () => {
  const record = snapshotActor(actor());
  assert.equal(record.actorVersion, 2);
  assert.equal(Object.hasOwn(record, 'traits'), false);
});

test('trait snapshot uses actorVersion 3 and round-trips exactly', () => {
  const source = actor({ traits: { ...TRAITS } });
  const record = snapshotActor(source);
  assert.equal(record.actorVersion, 3);
  assert.deepEqual(record.traits, TRAITS);
  const target = actor({ traits: undefined });
  applyCommonActorState(target, record);
  assert.deepEqual(target.traits, TRAITS);
});

test('v1/v2 records without traits migrate to v2, not v3', () => {
  for (const version of [1, 2, undefined]) {
    const migrated = migrateActorRecord(saved(version === undefined ? {} : { actorVersion: version }));
    assert.equal(migrated.actorVersion, 2);
    assert.equal(migrated.traits, undefined);
  }
  const world = migrateActorWorld({ bears: [saved({ actorVersion: 1 })] });
  assert.equal(world.bears[0].actorVersion, 2);
  assert.equal(world.bears[0].traits, undefined);
});

test('a v2 record carrying traits migrates to v3; a v3 without traits falls back to v2', () => {
  const withTraits = migrateActorRecord(saved({ actorVersion: 2, traits: { ...TRAITS } }));
  assert.equal(withTraits.actorVersion, 3);
  assert.deepEqual(withTraits.traits, TRAITS);
  const without = migrateActorRecord(saved({ actorVersion: 3 }));
  assert.equal(without.actorVersion, 2);
  assert.equal(without.traits, undefined);
});

test('v3 validation requires complete bounded traits', () => {
  const okay = [];
  validateActorWorld({ bears: [saved({ actorVersion: ACTOR_SAVE_VERSION, traits: { ...TRAITS } })] }, 'world', okay);
  assert.deepEqual(okay, []);

  const missing = [];
  validateActorWorld({ bears: [saved({ actorVersion: ACTOR_SAVE_VERSION })] }, 'world', missing);
  assert.match(missing.join('; '), /traits is required/);

  const bad = [];
  validateActorWorld({
    bears: [saved({ actorVersion: ACTOR_SAVE_VERSION, traits: { ...TRAITS, greed: 2 } })],
  }, 'world', bad);
  assert.match(bad.join('; '), /traits\.greed is invalid/);
});

test('an old no-trait save loads to the same hashed founder traits', () => {
  const old = migrateActorRecord(saved({ actorVersion: 2, uid: 77 }));
  const loaded = actor({ uid: 77, traits: undefined });
  applyCommonActorState(loaded, old);
  assert.equal(loaded.traits, undefined);
  ensureTraits(loaded);
  assert.deepEqual(loaded.traits, founderTraits(77, 'bear'));
});
