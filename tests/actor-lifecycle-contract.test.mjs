import test from 'node:test';
import assert from 'node:assert/strict';
import { createBehavior } from '../src/behaviors/index.js';
import { createActorView } from '../src/npc.js';
import { snapshotActor, applyCommonActorState } from '../src/actorrecord.js';
import {
  registerActorCollection,
  maxActorUid,
  validateActorWorld,
  validateGameRelationships,
} from '../src/actorsave.js';

// M5 contract coverage: live identity, UID references and the repeatable
// attach/detach part of the actor lifecycle. App pool/spawn/remove internals are
// not exported; docs/actor-session-lifecycle.md marks those claims Unverified.

function actor(uid, extra = {}) {
  return {
    uid, active: true, kind: 'bear', species: 'bear', name: `Bear ${uid}`,
    flavor: 0, sex: 'F', stage: 'adult', age: 700, scale: 1,
    health: 100, hunger: .3, thirst: .3, energy: 1,
    social: .3, affection: .25, bold: .5, sleeping: false,
    bonds: {}, skills: {}, history: [], playdates: {},
    home: 'Home 1', pregnant: false, gestation: 0, mateCooldown: 0,
    fatherUid: 0, parentUids: [], cx: 1, cy: 1, cz: 2,
    grabs: 0, inPond: false, ai: null,
    ...extra,
  };
}

function behaviorFixture(engine) {
  const field = {
    homes: [{ name: 'Home 1', x: 0, z: 0, door: { x: 1, z: 0 } }],
    nav: { nearestWalkable: (x, z) => ({ x, z }) },
    food: null,
    waterSpots: [],
  };
  const roster = [];
  const behavior = createBehavior({
    engine,
    field,
    getActors: () => roster,
    getHours: () => 12,
    getDay: () => 1,
    getPopulationCap: () => 40,
    getAdapter: () => ({ onStop() {} }),
    rng: () => .5,
  });
  return { behavior, roster };
}

for (const engine of ['legacy', 'modules']) {
  test(`repeated attach/detach cycles keep one owned ai value (${engine})`, () => {
    const { behavior } = behaviorFixture(engine);
    const first = actor(1);
    const second = actor(2, { cx: .5 });

    // Attaching twice is idempotent and does not replace live state.
    const initial = behavior.attach(first);
    assert.equal(initial, first.ai);
    initial.state = 'sentinel';
    assert.equal(behavior.attach(first), initial);
    assert.equal(first.ai.state, 'sentinel');

    // Detach clears the owned ai and is safe to repeat.
    behavior.detach(first);
    assert.equal(first.ai, null);
    behavior.detach(first);
    assert.equal(first.ai, null);

    // Each reattach creates a fresh runtime object; the actor identity is stable.
    for (let cycle = 0; cycle < 3; cycle++) {
      behavior.attach(first);
      behavior.attach(second);
      assert.ok(first.ai && second.ai);
      assert.notEqual(first.ai, initial);
      assert.notEqual(first.ai, second.ai);
      assert.equal(first.ai.state, 'wander');
      behavior.detach(first);
      behavior.detach(second);
      assert.equal(first.ai, null);
      assert.equal(second.ai, null);
      assert.equal(first.uid, 1);
      assert.equal(second.uid, 2);
      assert.equal(first.active, true);
      assert.equal(second.active, true);
    }
  });
}

test('actor view exposes live objects and drops removed slot identities', () => {
  const soft = actor(7, { px: new Float32Array(3) });
  const glass = actor(8, { kind: 'glass', species: 'glass', px: undefined });
  const inactive = actor(9, { active: false, px: new Float32Array(3) });
  const softList = [soft, inactive];
  const glassList = [glass];
  const view = createActorView({
    getSoft: () => softList,
    getGlass: () => glassList,
  });

  assert.notEqual(view.all(), view.all(), 'the view returns a fresh array');
  assert.equal(view.byUid(7), soft);
  assert.equal(view.byUid(8), glass);
  assert.equal(view.byUid(9), null);
  assert.ok(view.active().includes(soft));
  assert.ok(!view.active().includes(inactive));
  assert.ok(view.all().includes(inactive), 'inactive objects stay in the raw roster');
  soft.hunger = .91;
  assert.equal(view.byUid(7).hunger, .91, 'the view holds the live actor, not a copy');

  // A pooled slot can be removed and later reused; the old UID is not a handle.
  soft.active = false;
  assert.equal(view.byUid(7), null);
  assert.ok(view.all().includes(soft));
  soft.uid = 10;
  soft.active = true;
  assert.equal(view.byUid(7), null);
  assert.equal(view.byUid(10), soft);
  assert.equal(view.all().filter(item => item === soft).length, 1);
});

registerActorCollection({
  key: 'contractFixtures',
  kind: 'fixture',
  validate() {},
});

test('reservation scans every registered collection across both maps', () => {
  const worlds = {
    field: {
      bears: [{ uid: 4 }],
      contractFixtures: [{ uid: 900000 }],
    },
    studio: {
      bears: [{ uid: 9 }, { uid: 'not-a-number' }, { uid: 0 }, null],
      glass: [{ uid: 6 }],
    },
  };
  assert.equal(maxActorUid(worlds), 900000);
  assert.equal(maxActorUid({ field: { bears: [{ uid: 5 }] }, studio: { glass: [{ uid: 6 }] } }), 6);
  assert.equal(maxActorUid({ field: { bears: [] }, studio: {} }), 0);
  assert.equal(maxActorUid(null), 0);
});

test('saved records keep persistent UID references and omit live handles', () => {
  const live = actor(1, {
    partnerUid: 2,
    rivals: { 3: { sinceDay: 2, sinceHour: 9.5 } },
    bonds: { 2: .7, 3: .4 },
    carriedFood: { id: 'gift-1', kind: 'flower', satiation: .2 },
    ai: { state: 'wander' },
    mesh: { isMesh: true },
    handles: new Int32Array([1, 2]),
    body: { handle: 3 },
    groups: [{ id: 'group-1' }],
  });
  const record = snapshotActor(live, { flavor: 0 });

  for (const key of ['ai', 'mesh', 'handles', 'body', 'groups', 'active', 'partner']) {
    assert.equal(key in record, false, `${key} is not saved`);
  }
  assert.equal(record.uid, 1);
  assert.equal(record.partnerUid, 2);
  assert.deepEqual(record.rivals, { 3: { sinceDay: 2, sinceHour: 9.5 } });
  assert.deepEqual(record.bonds, { 2: .7, 3: .4 });
  assert.deepEqual(record.carriedFood, { id: 'gift-1', kind: 'flower', satiation: .2 });

  const cloned = JSON.parse(JSON.stringify(record));
  assert.equal(cloned.partnerUid, 2);
  assert.equal(cloned.ai, undefined);
  assert.equal(cloned.mesh, undefined);
});

test('common restore applies UID references without adopting saved live pointers', () => {
  const first = actor(1, { partnerUid: 2 });
  const second = actor(2, { partnerUid: 1 });
  const firstRecord = snapshotActor(first, { flavor: 0 });
  const secondRecord = snapshotActor(second, { flavor: 0 });

  const worlds = { field: { bears: [firstRecord, secondRecord] }, studio: {} };
  const errors = [];
  validateActorWorld(worlds.field, 'worlds.field', errors);
  assert.deepEqual(errors, []);
  validateGameRelationships(worlds, errors);
  assert.deepEqual(errors, []);

  const target = actor(1, {
    stage: 'teen', health: 10, cx: 4, cz: 5,
    partnerUid: 99,
    ai: { state: 'live' },
    mesh: { isMesh: true },
    body: { handle: 7 },
  });
  const liveAi = target.ai;
  const liveMesh = target.mesh;
  const liveBody = target.body;
  applyCommonActorState(target, {
    ...firstRecord,
    ai: { state: 'poison' },
    mesh: { poison: true },
    body: { poison: true },
    partner: { uid: 2 },
  });

  assert.equal(target.partnerUid, 2, 'persistent UID reference survives');
  assert.equal(target.partner, undefined, 'no live partner object is adopted');
  assert.equal(target.ai, liveAi, 'live behavior state is owned by the live actor');
  assert.equal(target.mesh, liveMesh, 'renderer handles stay with the live actor');
  assert.equal(target.body, liveBody, 'physics handles stay with the live actor');
  assert.equal(target.health, 100);
  assert.equal(target.stage, 'teen', 'representation/locomotion state is not restored here');
  assert.equal(target.cx, 4);
  assert.equal(target.cz, 5);
});
