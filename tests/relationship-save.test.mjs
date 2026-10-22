import test from 'node:test';
import assert from 'node:assert/strict';
import { snapshotActor, applyCommonActorState } from '../src/actorrecord.js';
import {
  ACTOR_SAVE_VERSION, migrateActorRecord, validateActorWorld, validateGameRelationships,
} from '../src/actorsave.js';
import { pruneActorRefs } from '../src/family.js';

function actor(uid, overrides = {}) {
  return {
    uid, active: true, kind: 'softbody', species: 'bear', name: `Bear ${uid}`,
    flavor: 0, sex: 'F', stage: 'adult', age: 700, scale: 1,
    health: 100, hunger: .2, thirst: .2, energy: 1,
    social: .3, affection: .25, bold: .5,
    bonds: {}, skills: {}, history: [], playdates: {},
    home: 'Home 1', pregnant: false, gestation: 0, mateCooldown: 0,
    fatherUid: 0, parentUids: [], cx: 1, cz: 2,
    ...overrides,
  };
}

test('v8 persists rivalry, partnership and a carried portion', () => {
  const carried = { id: 'gift-4', kind: 'flower', satiation: .2 };
  const record = snapshotActor(actor(1, {
    partnerUid: 2,
    rivals: { 3: { sinceDay: 2, sinceHour: 9.5 } },
    carriedFood: carried,
    lastGiftDay: 2,
  }), { flavor: 0 });
  assert.equal(ACTOR_SAVE_VERSION, 9);
  assert.equal(record.actorVersion, 8);
  assert.equal(record.partnerUid, 2);
  assert.deepEqual(record.rivals, { 3: { sinceDay: 2, sinceHour: 9.5 } });
  assert.deepEqual(record.carriedFood, carried);
  assert.equal(record.lastGiftDay, 2);

  const errors = [];
  validateActorWorld({ bears: [record] }, 'world', errors);
  assert.deepEqual(errors, []);

  const restored = actor(1);
  applyCommonActorState(restored, record);
  assert.equal(restored.partnerUid, 2);
  assert.deepEqual(restored.rivals, { 3: { sinceDay: 2, sinceHour: 9.5 } });
  assert.equal(restored.carriedFood, undefined, 'load converts carried food outside the actor');
  assert.equal(restored.lastGiftDay, 2);
});

test('v8 fields require version 8 and a version 8 record needs one', () => {
  const errors = [];
  const base = snapshotActor(actor(1), { flavor: 0 });
  validateActorWorld({ bears: [
    { ...base, actorVersion: 7, partnerUid: 2 },
    { ...base, actorVersion: 8 },
  ] }, 'world', errors);
  assert.match(errors.join('; '), /partnerUid requires actorVersion 8/);
  assert.match(errors.join('; '), /no version-8 field/);

  const invalid = {
    ...snapshotActor(actor(1), { flavor: 0 }),
    actorVersion: 8,
    rivals: { 1: { sinceDay: 1, sinceHour: 1 } },
    carriedFood: { id: '', kind: '', satiation: 0 },
  };
  const invalidErrors = [];
  validateActorWorld({ bears: [invalid] }, 'world', invalidErrors);
  assert.match(invalidErrors.join('; '), /rivals\.1 is invalid/);
  assert.match(invalidErrors.join('; '), /carriedFood is invalid/);
});

test('partnership and rivalry references must be reciprocal and present', () => {
  const a = snapshotActor(actor(1, { partnerUid: 2, rivals: { 3: { sinceDay: 1, sinceHour: 2 } } }));
  const b = snapshotActor(actor(2, { partnerUid: 1 }));
  const c = snapshotActor(actor(3));
  const errors = [];
  validateGameRelationships({ field: { bears: [a, b, c] }, studio: {} }, errors);
  assert.match(errors.join('; '), /rivals\.3 is not reciprocal/);

  const orphan = snapshotActor(actor(4, { partnerUid: 99 }));
  const missing = [];
  validateGameRelationships({ field: { bears: [orphan] }, studio: {} }, missing);
  assert.match(missing.join('; '), /references missing actor 99/);

  const bad = snapshotActor(actor(5, { partnerUid: 6 }));
  const wrong = [];
  validateGameRelationships({ field: { bears: [bad, snapshotActor(actor(6, { partnerUid: 1 }))] }, studio: {} }, wrong);
  assert.match(wrong.join('; '), /not reciprocal/);
});

test('migration promotes new fields without dropping existing version data', () => {
  const migrated = migrateActorRecord(actor(1, {
    actorVersion: 2,
    partnerUid: 2,
    rivals: { 3: { sinceDay: 1, sinceHour: 4 } },
    carriedFood: { id: 'gift-1', kind: 'fruit', satiation: .18 },
  }));
  assert.equal(migrated.actorVersion, 8);
  assert.equal(migrated.partnerUid, 2);
  assert.equal(migrated.carriedFood.id, 'gift-1');
  assert.equal(migrated.rivals['3'].sinceDay, 1);
});

test('game-wide pruning preserves a partner on the inactive map', () => {
  const record = actor(1, {
    partnerUid: 2,
    rivals: { 3: { sinceDay: 1, sinceHour: 2 } },
  });
  assert.equal(pruneActorRefs(record, new Set([1, 2, 3])), false);
  assert.equal(record.partnerUid, 2);
  assert.equal(record.rivals['3'] !== undefined, true);
  assert.equal(pruneActorRefs(record, new Set([1])), true);
  assert.equal(record.partnerUid, undefined);
  assert.equal(record.rivals['3'], undefined);
});
