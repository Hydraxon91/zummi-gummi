import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultGenome } from '../src/dna.js';
import { snapshotActor, applyCommonActorState } from '../src/actorrecord.js';
import {
  ACTOR_SAVE_VERSION, migrateActorRecord, validateActorWorld,
} from '../src/actorsave.js';

function actor(uid, extra = {}) {
  return {
    uid, active: true, kind: 'bear', species: 'bear', name: `actor-${uid}`,
    stage: 'adult', age: 700, scale: 1, sex: 'F', flavor: 0,
    health: 100, hunger: .3, thirst: .3, energy: 1, social: .3, affection: .25,
    bold: .5, bonds: {}, skills: {}, history: [], playdates: {}, parentUids: [],
    fatherUid: 0, home: 'Home 1', genome: defaultGenome('bear'), cx: 1, cz: 2,
    ...extra,
  };
}

const delta = {
  kind: 'social', uid: 2, day: 1, hour: 8, bondBefore: .4, bondAfter: .52,
};

test('bond-delta history uses actorVersion 6 and round-trips', () => {
  const record = snapshotActor(actor(1, { history: [delta] }), { flavor: 0 });
  assert.equal(record.actorVersion, 6);
  assert.equal(record.history[0].bondBefore, .4);
  assert.equal(record.history[0].bondAfter, .52);
  const errors = [];
  validateActorWorld({ bears: [record] }, 'world', errors);
  assert.deepEqual(errors, []);

  const restored = actor(1);
  applyCommonActorState(restored, record);
  assert.equal(restored.history[0].bondBefore, .4);
  assert.equal(restored.history[0].bondAfter, .52);
  assert.equal(ACTOR_SAVE_VERSION, 7);
});

test('a Glass record with a bond delta validates on v6', () => {
  const record = snapshotActor(actor(9, {
    kind: 'glass', species: 'glass', genome: defaultGenome('glass'), history: [delta],
  }), { kind: 'glass', species: 'glass' });
  assert.equal(record.actorVersion, 6);
  const errors = [];
  validateActorWorld({ bears: [], glass: [record] }, 'world', errors);
  assert.deepEqual(errors, []);
  const restored = actor(9, { kind: 'glass', species: 'glass' });
  applyCommonActorState(restored, record);
  assert.equal(restored.history[0].bondAfter, .52);
});

test('a persisted gift day uses actorVersion 7 and round-trips', () => {
  const record = snapshotActor(actor(1, {
    lastGiftDay: 3, history: [delta],
  }), { flavor: 0 });
  assert.equal(record.actorVersion, 7);
  assert.equal(record.lastGiftDay, 3);
  const errors = [];
  validateActorWorld({ bears: [record] }, 'world', errors);
  assert.deepEqual(errors, []);
  const restored = actor(1);
  applyCommonActorState(restored, record);
  assert.equal(restored.lastGiftDay, 3);

  const wrongVersion = [];
  validateActorWorld({ bears: [{ ...record, actorVersion: 6 }] }, 'world', wrongVersion);
  assert.match(wrongVersion.join('; '), /lastGiftDay requires actorVersion 7/);

  const missing = snapshotActor(actor(2), { flavor: 0 });
  const missingErrors = [];
  validateActorWorld({ bears: [{ ...missing, actorVersion: 7 }] }, 'world', missingErrors);
  assert.match(missingErrors.join('; '), /lastGiftDay is required for actorVersion 7/);

  const migrated = migrateActorRecord(actor(3, { actorVersion: 2, lastGiftDay: 4 }));
  assert.equal(migrated.actorVersion, 7);
  assert.equal(migrated.lastGiftDay, 4);
});

test('deltas require v6 and v6 requires at least one delta', () => {
  const record = snapshotActor(actor(1, { history: [delta] }), { flavor: 0 });
  const errors = [];
  validateActorWorld({ bears: [{ ...record, actorVersion: 5 }] }, 'world', errors);
  assert.match(errors.join('; '), /bondDelta requires actorVersion 6/);

  const without = snapshotActor(actor(2), { flavor: 0 });
  const missing = [];
  validateActorWorld({ bears: [{ ...without, actorVersion: 6 }] }, 'world', missing);
  assert.match(missing.join('; '), /bondDelta is required for actorVersion 6/);

  const bad = snapshotActor(actor(3), { flavor: 0 });
  bad.actorVersion = 6;
  bad.history = [{ kind: 'social', uid: 2, day: 1, hour: 8, bondBefore: 1.2, bondAfter: .5 }];
  const invalid = [];
  validateActorWorld({ bears: [bad] }, 'world', invalid);
  assert.match(invalid.join('; '), /bondDelta is invalid/);
});

test('a guardian and a bond delta can coexist on v6', () => {
  const record = snapshotActor(actor(1, {
    stage: 'baby', guardianUid: 3, history: [delta],
  }), { flavor: 0 });
  assert.equal(record.actorVersion, 6);
  assert.equal(record.guardianUid, 3);
  const errors = [];
  validateActorWorld({ bears: [record] }, 'world', errors);
  assert.deepEqual(errors, []);
});

test('migration promotes old records with deltas to v6 without renumbering', () => {
  const old = actor(1, {
    actorVersion: 2,
    history: [{ kind: 'social', uid: 2, day: 1, hour: 8, bondBefore: .2, bondAfter: .3 }],
  });
  const migrated = migrateActorRecord(old);
  assert.equal(migrated.actorVersion, 6);
  assert.equal(migrated.uid, 1);
  assert.equal(migrated.history[0].bondBefore, .2);

  const guardian = migrateActorRecord(actor(2, {
    actorVersion: 5, stage: 'baby', guardianUid: 3,
    history: [{ kind: 'social', uid: 3, day: 1, hour: 8, bondBefore: .5, bondAfter: .6 }],
  }));
  assert.equal(guardian.actorVersion, 6);
  assert.equal(guardian.guardianUid, 3);
});
