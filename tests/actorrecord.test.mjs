import test from 'node:test';
import assert from 'node:assert/strict';
import { snapshotActor, applyCommonActorState } from '../src/actorrecord.js';

function actor(overrides = {}) {
  return {
    uid: 7, active: true, kind: 'softbody', species: 'bear', name: 'Pip',
    sex: 'F', stage: 'teen', age: 220, scale: .78,
    health: 91, hunger: .42, thirst: .31, energy: .77,
    social: .22, affection: .18, bold: .6,
    bonds: { 3: .5 }, skills: { forage: .4, courage: .1, social: 0 },
    history: [{ kind: 'playdate', uid: 3, day: 1, hour: 15 }],
    playdates: { 3: { day: 2, hour: 14.5 } },
    home: 'Home 1', pregnant: false, gestation: 0, mateCooldown: 0,
    fatherUid: 0, parentUids: [1, 2], genome: { version: 1 },
    cx: 2.25, cz: -3.5,
    ...overrides,
  };
}

test('snapshotActor writes the shared v2 life record', () => {
  const record = snapshotActor(actor());
  assert.equal(record.actorVersion, 2);
  assert.equal(record.uid, 7);
  assert.equal(record.x, 2.25);
  assert.equal(record.z, -3.5);
  assert.deepEqual(record.skills, { forage: .4, courage: .1, social: 0 });
  assert.equal(record.history[0].kind, 'playdate');
  assert.deepEqual(record.playdates, { 3: { day: 2, hour: 14.5 } });
  assert.equal(record.kind, undefined, 'soft-body records do not need a kind tag');
});

test('snapshotActor tags Glass and applies common state without touching visuals', () => {
  const glass = actor({ uid: 8, kind: 'glass', species: 'glass', flavor: undefined });
  const record = snapshotActor(glass);
  assert.equal(record.kind, 'glass');
  assert.equal(record.species, 'glass');

  const target = actor({ uid: 9, health: 10, hunger: 1, skills: {}, history: [], playdates: {} });
  applyCommonActorState(target, record);
  assert.equal(target.health, 91);
  assert.equal(target.hunger, .42);
  assert.deepEqual(target.skills, { forage: .4, courage: .1, social: 0 });
  assert.deepEqual(target.playdates, { 3: { day: 2, hour: 14.5 } });
  assert.equal(target.parentUids[0], 1, 'ancestry is not overwritten by the common restore');
});
