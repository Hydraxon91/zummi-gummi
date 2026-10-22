import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultGenome } from '../src/dna.js';
import { snapshotActor, applyCommonActorState } from '../src/actorrecord.js';
import {
  validateActorWorld, migrateActorRecord, ACTOR_SAVE_VERSION,
} from '../src/actorsave.js';
import { pruneActorRefs } from '../src/family.js';

function actor(uid, overrides = {}) {
  return {
    uid, active: true, kind: 'bear', species: 'bear', name: `actor-${uid}`,
    stage: 'baby', age: 60, scale: .6, sex: 'F', flavor: 0,
    health: 100, hunger: .3, thirst: .3, energy: 1, social: .3, affection: .25,
    bold: .5, bonds: {}, skills: {}, history: [], playdates: {}, parentUids: [],
    fatherUid: 0, home: 'Home 1', genome: defaultGenome('bear'), cx: 1, cz: 2,
    ...overrides,
  };
}

test('a baby guardian uses actorVersion 5 and round-trips', () => {
  const child = actor(7, { guardianUid: 3 });
  const record = snapshotActor(child, { flavor: 0 });
  assert.equal(record.actorVersion, 5);
  assert.equal(record.guardianUid, 3);
  const errors = [];
  validateActorWorld({ bears: [record] }, 'world', errors);
  assert.deepEqual(errors, []);

  const restored = actor(7);
  applyCommonActorState(restored, record);
  assert.equal(restored.guardianUid, 3);

  const plain = actor(8);
  assert.equal(snapshotActor(plain).actorVersion, 2);
  assert.equal(snapshotActor(plain).guardianUid, undefined);
});

test('only babies can carry a guardian and v5 requires it', () => {
  const teen = actor(7, { stage: 'teen', guardianUid: 3 });
  assert.equal(snapshotActor(teen).actorVersion, 2);
  assert.equal(snapshotActor(teen).guardianUid, undefined);

  const errors = [];
  validateActorWorld({
    bears: [
      { ...snapshotActor(actor(1, { guardianUid: 3 })), actorVersion: 4 },
      { ...snapshotActor(actor(2)), actorVersion: 5 },
      { ...snapshotActor(actor(3)), stage: 'teen', guardianUid: 4, actorVersion: 5 },
    ],
  }, 'world', errors);
  const text = errors.join('; ');
  assert.match(text, /guardianUid requires actorVersion 5/);
  assert.match(text, /guardianUid is required for actorVersion 5/);
  assert.match(text, /guardianUid requires stage baby/);
});

test('migration keeps a valid guardian and drops an invalid one', () => {
  const migrated = migrateActorRecord(actor(7, { guardianUid: 4, actorVersion: 4 }));
  assert.equal(migrated.actorVersion, 5);
  assert.equal(migrated.guardianUid, 4);

  const teen = migrateActorRecord(actor(7, { stage: 'teen', guardianUid: 4, actorVersion: 2 }));
  assert.equal(teen.actorVersion, 2);
  assert.equal(teen.guardianUid, undefined);
  assert.equal(ACTOR_SAVE_VERSION, 9);

  const mourning = migrateActorRecord(actor(7, {
    actorVersion: 4,
    mourning: [{
      uid: 4, cause: 'stars', day: 1, hours: 6, untilDay: 2,
      duration: 1, closeness: .5, lastComfortDay: null,
    }],
  }));
  assert.equal(mourning.actorVersion, 4, 'v4 mourning keeps its original version');
});

test('a departed guardian is pruned from the saved reference set', () => {
  const child = actor(7, { guardianUid: 9 });
  assert.equal(pruneActorRefs(child, new Set([7, 8])), true);
  assert.equal(child.guardianUid, undefined);
  const kept = actor(8, { guardianUid: 9 });
  assert.equal(pruneActorRefs(kept, new Set([8, 9])), false);
  assert.equal(kept.guardianUid, 9);
});

test('a Glass baby guardian round-trips through the shared actor shape', () => {
  const child = actor(12, {
    kind: 'glass', species: 'glass', guardianUid: 11, genome: defaultGenome('glass'),
  });
  const record = snapshotActor(child);
  assert.equal(record.actorVersion, 5);
  assert.equal(record.kind, 'glass');
  assert.equal(record.guardianUid, 11);
  const errors = [];
  validateActorWorld({ bears: [], glass: [record] }, 'world', errors);
  assert.deepEqual(errors, []);
  const restored = actor(12, { kind: 'glass', species: 'glass' });
  applyCommonActorState(restored, record);
  assert.equal(restored.guardianUid, 11);
});
